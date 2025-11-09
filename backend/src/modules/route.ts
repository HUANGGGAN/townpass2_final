import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { AppError } from '../middlewares/errorHandler';

interface RoutePoint {
  id: number;
  time: string;
  lat: number;
  lng: number;
}

interface ProcessedPoint {
  lat: number;
  lng: number;
  originalId: number;
  relocatedToCctv?: boolean;
  cctvId?: number;
}

class RouteModule {
  // Find nearest safe place within radius using SQL
  async findNearestSafePlaceInRadius(lat: number, lng: number, radiusMeters: number) {
    const result = await prisma.$queryRaw<Array<{
      id: number;
      name: string;
      lat: number;
      lng: number;
      type: string;
      distance: number;
    }>>`
      SELECT 
        id,
        name,
        lat,
        lng,
        type,
        (
          6371000 * acos(
            LEAST(1.0, 
              cos(radians(${lat})) * 
              cos(radians(lat)) * 
              cos(radians(lng) - radians(${lng})) + 
              sin(radians(${lat})) * 
              sin(radians(lat))
            )
          )
        ) AS distance
      FROM safe_place
      WHERE (
        6371000 * acos(
          LEAST(1.0,
            cos(radians(${lat})) * 
            cos(radians(lat)) * 
            cos(radians(lng) - radians(${lng})) + 
            sin(radians(${lat})) * 
            sin(radians(lat))
          )
        )
      ) <= ${radiusMeters}
      ORDER BY distance ASC
      LIMIT 1
    `;

    return result.length > 0 ? result[0] : null;
  }

  // Find nearest CCTV within radius using SQL
  async findNearestCctvInRadius(lat: number, lng: number, radiusMeters: number) {
    const result = await prisma.$queryRaw<Array<{
      id: number;
      uuid: string;
      lat: number;
      lng: number;
      owner: string;
      distance: number;
    }>>`
      SELECT 
        id,
        uuid,
        lat,
        lng,
        owner,
        (
          6371000 * acos(
            LEAST(1.0,
              cos(radians(${lat})) * 
              cos(radians(lat)) * 
              cos(radians(lng) - radians(${lng})) + 
              sin(radians(${lat})) * 
              sin(radians(lat))
            )
          )
        ) AS distance
      FROM cctv
      WHERE (
        6371000 * acos(
          LEAST(1.0,
            cos(radians(${lat})) * 
            cos(radians(lat)) * 
            cos(radians(lng) - radians(${lng})) + 
            sin(radians(${lat})) * 
            sin(radians(lat))
          )
        )
      ) <= ${radiusMeters}
      ORDER BY distance ASC
    `;

    return result.length > 0 ? result[0] : null;
  }

  // Find all safe places within radius using SQL
  async findAllSafePlacesInRadius(lat: number, lng: number, radiusMeters: number) {
    const result = await prisma.$queryRaw<Array<{
      id: number;
      name: string;
      lat: number;
      lng: number;
      type: string;
      distance: number;
    }>>`
      SELECT 
        id,
        name,
        lat,
        lng,
        type,
        (
          6371000 * acos(
            LEAST(1.0, 
              cos(radians(${lat})) * 
              cos(radians(lat)) * 
              cos(radians(lng) - radians(${lng})) + 
              sin(radians(${lat})) * 
              sin(radians(lat))
            )
          )
        ) AS distance
      FROM safe_place
      WHERE (
        6371000 * acos(
          LEAST(1.0,
            cos(radians(${lat})) * 
            cos(radians(lat)) * 
            cos(radians(lng) - radians(${lng})) + 
            sin(radians(${lat})) * 
            sin(radians(lat))
          )
        )
      ) <= ${radiusMeters}
      ORDER BY distance ASC
    `;

    return result;
  }

  // Find all CCTV within radius using SQL
  async findAllCctvInRadius(lat: number, lng: number, radiusMeters: number) {
    const result = await prisma.$queryRaw<Array<{
      id: number;
      uuid: string;
      lat: number;
      lng: number;
      owner: string;
      distance: number;
    }>>`
      SELECT 
        id,
        uuid,
        lat,
        lng,
        owner,
        (
          6371000 * acos(
            LEAST(1.0,
              cos(radians(${lat})) * 
              cos(radians(lat)) * 
              cos(radians(lng) - radians(${lng})) + 
              sin(radians(${lat})) * 
              sin(radians(lat))
            )
          )
        ) AS distance
      FROM cctv
      WHERE (
        6371000 * acos(
          LEAST(1.0,
            cos(radians(${lat})) * 
            cos(radians(lat)) * 
            cos(radians(lng) - radians(${lng})) + 
            sin(radians(${lat})) * 
            sin(radians(lat))
          )
        )
      ) <= ${radiusMeters}
      ORDER BY distance ASC
    `;

    return result;
  }

  // Find safe place starting from current location with decreasing radius
  async findSafePlaceFromPoints(points: RoutePoint[]) {
    const radii = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];

    for (let i = 0; i < points.length && i < radii.length; i++) {
      const point = points[i];
      const radius = radii[i];
      const safePlace = await this.findNearestSafePlaceInRadius(
        point.lat,
        point.lng,
        radius
      );

      if (safePlace) {
        return {
          safePlace,
          foundAtPointIndex: i,
        };
      }
    }

    return null;
  }

  // Process points: replace with CCTV if within 60m
  async processPointsWithCctv(points: RoutePoint[]): Promise<ProcessedPoint[]> {
    const processed: ProcessedPoint[] = [];

    for (const point of points) {
      const nearbyCctv = await this.findNearestCctvInRadius(
        point.lat,
        point.lng,
        60
      );

      if (nearbyCctv) {
        processed.push({
          lat: nearbyCctv.lat,
          lng: nearbyCctv.lng,
          originalId: point.id,
          relocatedToCctv: true,
          cctvId: nearbyCctv.id,
        });
      } else {
        processed.push({
          lat: point.lat,
          lng: point.lng,
          originalId: point.id,
        });
      }
    }

    return processed;
  }

  // Get route from Google Maps Directions API
  async getGoogleMapsRoute(waypoints: ProcessedPoint[], destination: { lat: number; lng: number }) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new AppError('Google Maps API key not configured', 500);
    }

    const origin = `${waypoints[0].lat},${waypoints[0].lng}`;
    const dest = `${destination.lat},${destination.lng}`;

    const waypointsList = waypoints.slice(1).map((p) => `${p.lat},${p.lng}`);
    const waypointsStr = waypointsList.join('|');

    const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
    url.searchParams.set('origin', origin);
    url.searchParams.set('destination', dest);
    if (waypointsStr) {
      url.searchParams.set('waypoints', waypointsStr);
    }
    url.searchParams.set('key', apiKey);
    url.searchParams.set('mode', 'walking');

    const response = await fetch(url.toString());
    const data = await response.json() as { status: string; routes?: any[]; [key: string]: any };

    if (data.status !== 'OK') {
      throw new AppError(`Google Maps API error: ${data.status}`, 500);
    }

    return data;
  }

  // Plan route: find safe place, process points with CCTV, get Google Maps route
  async planRoute(req: Request, res: Response, next: NextFunction) {
    try {
      const { points } = req.body as { points: RoutePoint[] };

      if (!Array.isArray(points) || points.length === 0) {
        throw new AppError('Invalid points array', 400);
      }

      if (points.length > 10) {
        throw new AppError('Maximum 10 points allowed', 400);
      }

      // Step 1: Find safe place starting from current location
      let safePlaceResult = await this.findSafePlaceFromPoints(points);

      // If no safe place found in radius, find nearest one regardless of distance
      if (!safePlaceResult) {
        const firstPoint = points[0];
        const allSafePlaces = await prisma.safePlace.findMany({});
        
        if (allSafePlaces.length === 0) {
          throw new AppError('No safe place found in database', 404);
        }

        let nearest = allSafePlaces[0];
        let minDistance = 6371000 * Math.acos(
          Math.min(1.0,
            Math.cos(firstPoint.lat * Math.PI / 180) *
            Math.cos(nearest.lat * Math.PI / 180) *
            Math.cos((nearest.lng - firstPoint.lng) * Math.PI / 180) +
            Math.sin(firstPoint.lat * Math.PI / 180) *
            Math.sin(nearest.lat * Math.PI / 180)
          )
        ) * 1000;

        for (const place of allSafePlaces) {
          const distance = 6371000 * Math.acos(
            Math.min(1.0,
              Math.cos(firstPoint.lat * Math.PI / 180) *
              Math.cos(place.lat * Math.PI / 180) *
              Math.cos((place.lng - firstPoint.lng) * Math.PI / 180) +
              Math.sin(firstPoint.lat * Math.PI / 180) *
              Math.sin(place.lat * Math.PI / 180)
            )
          ) * 1000;
          
          if (distance < minDistance) {
            minDistance = distance;
            nearest = place;
          }
        }

        safePlaceResult = {
          safePlace: {
            id: nearest.id,
            name: nearest.name,
            lat: nearest.lat,
            lng: nearest.lng,
            type: nearest.type || 'police',
            distance: minDistance,
          },
          foundAtPointIndex: points.length - 1,
        };
      }

      const { safePlace, foundAtPointIndex } = safePlaceResult;

      // Step 2: Get points before safe place was found (must pass through these)
      const pointsBeforeSafePlace = points.slice(0, foundAtPointIndex + 1);

      // Step 3: Process points with CCTV replacement (60m radius)
      const processedPoints = await this.processPointsWithCctv(pointsBeforeSafePlace);

      // Step 4: Add safe place as destination
      const finalWaypoints = [
        ...processedPoints,
        {
          lat: safePlace.lat,
          lng: safePlace.lng,
          originalId: -1,
        },
      ];

      // Step 5: Get route from Google Maps API (only one call)
      const routeData = await this.getGoogleMapsRoute(finalWaypoints, {
        lat: safePlace.lat,
        lng: safePlace.lng,
      });

      return sendSuccess(
        res,
        {
          route: routeData,
          safePlace: {
            id: safePlace.id,
            name: safePlace.name,
            lat: safePlace.lat,
            lng: safePlace.lng,
            type: safePlace.type || 'police',
            foundAtPointIndex,
          },
          processedPoints: processedPoints.map((p) => ({
            lat: p.lat,
            lng: p.lng,
            originalId: p.originalId,
            type: p.relocatedToCctv ? 'cctv' : 'point',
            relocatedToCctv: p.relocatedToCctv || false,
            cctvId: p.cctvId,
          })),
        },
        'Route planned successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  // Search for safe places and CCTV within search radius for all points
  async searchNearby(req: Request, res: Response, next: NextFunction) {
    try {
      const { points } = req.body as { points: RoutePoint[] };

      if (!Array.isArray(points) || points.length === 0) {
        throw new AppError('Invalid points array', 400);
      }

      if (points.length > 10) {
        throw new AppError('Maximum 10 points allowed', 400);
      }

      const radii = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
      const allSafePlaces = new Map<number, Array<{
        id: number;
        name: string;
        lat: number;
        lng: number;
        type: string;
        distance: number;
        pointIndex: number;
        radius: number;
      }>>();
      const allCctv = new Map<number, Array<{
        id: number;
        uuid: string;
        lat: number;
        lng: number;
        owner: string;
        type: string;
        distance: number;
        pointIndex: number;
        radius: number;
      }>>();

      for (let i = 0; i < points.length && i < radii.length; i++) {
        const point = points[i];
        const radius = radii[i];

        const safePlaces = await this.findAllSafePlacesInRadius(
          point.lat,
          point.lng,
          radius
        );

        const cctvList = await this.findAllCctvInRadius(
          point.lat,
          point.lng,
          radius
        );

        if (safePlaces.length > 0) {
          allSafePlaces.set(i, safePlaces.map((sp: {
            id: number;
            name: string;
            lat: number;
            lng: number;
            type: string;
            distance: number;
          }) => ({
            ...sp,
            type: sp.type || 'police',
            pointIndex: i,
            radius: radius + 20,
          })));
        }

        if (cctvList.length > 0) {
          allCctv.set(i, cctvList.map((c: {
            id: number;
            uuid: string;
            lat: number;
            lng: number;
            owner: string;
            distance: number;
          }) => ({
            ...c,
            type: 'cctv',
            pointIndex: i,
            radius: radius + 20,
          })));
        }
      }

      const safePlacesList = Array.from(allSafePlaces.values()).flat();
      const cctvList = Array.from(allCctv.values()).flat();

      return sendSuccess(
        res,
        {
          points: points.map((p, i) => ({
            id: p.id,
            lat: p.lat,
            lng: p.lng,
            time: p.time,
            searchRadius: (radii[i] || 0) + 20,
          })),
          safePlaces: safePlacesList,
          cctv: cctvList,
          summary: {
            totalSafePlaces: safePlacesList.length,
            totalCctv: cctvList.length,
            pointsWithSafePlaces: allSafePlaces.size,
            pointsWithCctv: allCctv.size,
          },
        },
        'Search completed successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async findForwardSafePlace(req: Request, res: Response, next: NextFunction) {
    try {
      const { points, radius } = req.body as {
        points: Array<{ lat: number; lng: number }>;
        radius: number;
      };

      if (!points || points.length < 2) {
        throw new AppError('Must provide at least 2 points to determine direction', 400);
      }

      if (points.length > 10) {
        throw new AppError('Maximum 10 points allowed', 400);
      }

      if (!radius || radius <= 0) {
        throw new AppError('Radius must be positive', 400);
      }

      const n = points.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

      points.forEach((point) => {
        const x = point.lng;
        const y = point.lat;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
      });

      const avgX = sumX / n;
      const avgY = sumY / n;

      const currentPoint = points[0];
      const oldestPoint = points[points.length - 1];
      const directionVector = {
        x: oldestPoint.lng - currentPoint.lng,
        y: oldestPoint.lat - currentPoint.lat,
      };

      const magnitude = Math.sqrt(directionVector.x * directionVector.x + directionVector.y * directionVector.y);
      if (magnitude < 1e-10) {
        throw new AppError('Points are too close, cannot determine direction', 400);
      }

      const normalizedDirection = {
        x: directionVector.x / magnitude,
        y: directionVector.y / magnitude,
      };

      const denominator = sumX2 - n * avgX * avgX;
      let a: number;
      let b: number;
      
      if (Math.abs(denominator) < 1e-10) {
        if (Math.abs(normalizedDirection.x) < 1e-10) {
          a = Infinity;
          b = currentPoint.lng;
        } else {
          a = normalizedDirection.y / normalizedDirection.x;
          b = currentPoint.lat - a * currentPoint.lng;
        }
      } else {
        a = (sumXY - n * avgX * avgY) / denominator;
        b = avgY - a * avgX;
      }

      const refPoint = currentPoint;

      const allSafePlaces = await this.findAllSafePlacesInRadius(
        refPoint.lat,
        refPoint.lng,
        radius
      );

      const forwardSafePlaces = allSafePlaces.filter((place: {
        id: number;
        name: string;
        lat: number;
        lng: number;
        type: string;
        distance: number;
      }) => {
        const dx = place.lng - refPoint.lng;
        const dy = place.lat - refPoint.lat;
        const crossProduct = dx * normalizedDirection.y - dy * normalizedDirection.x;
        return crossProduct >= 0;
      });

      if (forwardSafePlaces.length === 0) {
        return sendSuccess(
          res,
          {
            direction: {
              slope: a,
              intercept: b,
              vector: normalizedDirection,
            },
            reference_point: refPoint,
            safe_places: [],
            nearest_safe_place: null,
            route: null,
          },
          'No safe places found in forward direction'
        );
      }

      const nearestSafePlace = forwardSafePlaces[0];

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        throw new AppError('Google Maps API key not configured', 500);
      }

      const origin = `${refPoint.lat},${refPoint.lng}`;
      const destination = `${nearestSafePlace.lat},${nearestSafePlace.lng}`;

      const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
      url.searchParams.append('origin', origin);
      url.searchParams.append('destination', destination);
      url.searchParams.append('key', apiKey);
      url.searchParams.append('mode', 'walking');

      const routeResponse = await fetch(url.toString());
      if (!routeResponse.ok) {
        throw new AppError(`Google Maps API error: ${routeResponse.status}`, 500);
      }

      const routeData = await routeResponse.json() as {
        status: string;
        routes?: Array<{
          legs: Array<{
            distance?: { text?: string };
            duration?: { text?: string };
            start_address?: string;
            end_address?: string;
            steps: Array<{
              distance?: { text?: string };
              duration?: { text?: string };
              html_instructions?: string;
              start_location?: { lat: number; lng: number };
              end_location?: { lat: number; lng: number };
              polyline?: { points?: string };
            }>;
          }>;
          overview_polyline?: { points?: string };
        }>;
      };

      if (routeData.status !== 'OK') {
        throw new AppError(`Google Maps API error: ${routeData.status}`, 500);
      }

      if (!routeData.routes || routeData.routes.length === 0) {
        throw new AppError('No routes found', 500);
      }

      const route = routeData.routes[0];
      const leg = route.legs[0];
      const steps = leg.steps.map((step: any) => ({
        distance: step.distance?.text || '',
        duration: step.duration?.text || '',
        instruction: step.html_instructions || '',
        start_location: step.start_location,
        end_location: step.end_location,
        polyline: step.polyline?.points || '',
      }));

      return sendSuccess(
        res,
        {
          direction: {
            slope: a,
            intercept: b,
            vector: normalizedDirection,
          },
          reference_point: refPoint,
          safe_places: forwardSafePlaces.map((place: {
            id: number;
            name: string;
            lat: number;
            lng: number;
            type: string;
            distance: number;
          }) => ({
            id: place.id,
            name: place.name,
            lat: place.lat,
            lng: place.lng,
            type: place.type,
            distance: place.distance,
          })),
          nearest_safe_place: {
            id: nearestSafePlace.id,
            name: nearestSafePlace.name,
            lat: nearestSafePlace.lat,
            lng: nearestSafePlace.lng,
            type: nearestSafePlace.type,
            distance: nearestSafePlace.distance,
          },
          route: {
            distance: leg.distance?.text || '',
            duration: leg.duration?.text || '',
            start_address: leg.start_address || '',
            end_address: leg.end_address || '',
            steps: steps,
            overview_polyline: route.overview_polyline?.points || '',
          },
        },
        'Forward safe place found successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export default new RouteModule();
