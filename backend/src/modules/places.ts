import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { SafePlaceType, SafePlace } from '@prisma/client';
import { sendSuccess } from '../utils/apiResponse';
import { AppError } from '../middlewares/errorHandler';
import { GetPlacesQuery } from '../schemas';
import { calculateDistance } from '../utils/geoUtils';
import { getCache, setCache } from '../utils/cache';
import { CACHE_TTL } from '../config/constants';

export interface SafePlaceWithDistance extends SafePlace {
  distance: number;
}

class PlacesModule {
  async findAll(types?: SafePlaceType[]): Promise<SafePlace[]> {
    const where = types && types.length > 0 ? { type: { in: types } } : {};
    return prisma.safePlace.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: number): Promise<SafePlace | null> {
    return prisma.safePlace.findUnique({
      where: { id },
    });
  }

  async getAllPlaces(types?: SafePlaceType[]): Promise<SafePlace[]> {
    const cacheKey = `safe-places:all:${types?.join(',') || 'all'}`;
    const cached = await getCache<SafePlace[]>(cacheKey);
    if (cached) return cached;

    const places = await this.findAll(types);
    await setCache(cacheKey, places, CACHE_TTL.PLACES);
    return places;
  }

  async getNearbyPlaces(
    latitude: number,
    longitude: number,
    radiusKm?: number,
    types?: SafePlaceType[]
  ): Promise<SafePlaceWithDistance[]> {
    const allPlaces = await this.getAllPlaces(types);
    const placesWithDistance: SafePlaceWithDistance[] = allPlaces
      .map((place) => ({
        ...place,
        distance: calculateDistance(latitude, longitude, place.lat, place.lng),
      }))
      .filter((place) => !radiusKm || place.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
    return placesWithDistance;
  }

  async getPlaces(req: Request, res: Response, next: NextFunction) {
    try {
      const { lat, lng, type, radius } = req.query as GetPlacesQuery;
      if (lat !== undefined && lng !== undefined) {
        const places = await this.getNearbyPlaces(lat, lng, radius, type ? [type as SafePlaceType] : undefined);
        return sendSuccess(res, places, 'Places retrieved successfully');
      }
      const places = await this.getAllPlaces(type ? [type as SafePlaceType] : undefined);
      return sendSuccess(res, places, 'Places retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getPlaceById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params as { id: string };
      const placeId = parseInt(id, 10);
      if (isNaN(placeId)) {
        throw new AppError('Invalid place ID', 400);
      }
      const place = await this.findById(placeId);
      if (!place) {
        throw new AppError('Place not found', 404);
      }
      return sendSuccess(res, place, 'Place retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export default new PlacesModule();
