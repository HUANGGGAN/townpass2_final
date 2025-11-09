import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../config/database';
import { PrismaClient } from '@prisma/client';
import { sendSuccess } from '../utils/apiResponse';
import { AppError } from '../middlewares/errorHandler';

const MAX_POINTS_PER_USER = parseInt(process.env.MAX_POINTS_PER_USER || '10', 10);

class DangerPointsModule {
  private calculateAlpha(count: number): number {
    return count > 0 ? 1 / count : 0;
  }

  private async enforceMaxPoints(uuid: string): Promise<void> {
    const pointCount = await (prisma as any).dangerPoint.count({
      where: { uuid },
    });

    if (pointCount >= MAX_POINTS_PER_USER) {
      const oldestPoint = await (prisma as any).dangerPoint.findFirst({
        where: { uuid },
        orderBy: { createdAt: 'asc' },
      });

      if (oldestPoint) {
        await (prisma as any).dangerPoint.delete({
          where: { id: oldestPoint.id },
        });

        await prisma.identity.updateMany({
          where: { uuid },
          data: { count: { decrement: 1 } } as any,
        });
      }
    }
  }

  async createPoint(req: Request, res: Response, next: NextFunction) {
    try {
      const { uuid, time, lat, lon, type } = req.body as {
        uuid: string;
        time: string;
        lat: number;
        lon: number;
        type: 'light' | 'few' | 'monitor' | 'dangerous';
      };

      if (!uuid || !time || lat === undefined || lon === undefined || !type) {
        throw new AppError('Missing required fields: uuid, time, lat, lon, type', 400);
      }

      const validTypes = ['light', 'few', 'monitor', 'dangerous'];
      if (!validTypes.includes(type)) {
        throw new AppError('Type must be one of: light, few, monitor, dangerous', 400);
      }

      if (typeof lat !== 'number' || typeof lon !== 'number') {
        throw new AppError('lat and lon must be numbers', 400);
      }

      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new AppError('Invalid coordinate range', 400);
      }

      let identity = await prisma.identity.findUnique({
        where: { uuid },
      });

      if (!identity) {
        identity = await prisma.identity.create({
          data: {
            account: `user_${uuid.substring(0, 8)}`,
            uuid,
            name: 'Unknown',
            idNo: 'N/A',
            count: 0,
          } as any,
        });
      }

      await this.enforceMaxPoints(uuid);

      const currentCount = await (prisma as any).dangerPoint.count({
        where: { uuid },
      });
      const newCount = currentCount + 1;
      const alpha = this.calculateAlpha(newCount);

      const timeStr = time.replace(/:\d{6}$/, '');
      const timeDate = new Date(timeStr);

      const uuuid = randomUUID();
      const result = await prisma.$queryRaw<Array<{ id: number }>>
      `
        INSERT INTO danger_points (uuid, uuuid, alpha, type, time, lat, lng, geom, "createdAt")
        VALUES (
          ${uuid}::text,
          ${uuuid}::text,
          ${alpha}::double precision,
          ${type}::"DangerPointType",
          ${timeDate}::timestamp,
          ${lat}::double precision,
          ${lon}::double precision,
          ST_Transform(ST_SetSRID(ST_MakePoint(${lon}::double precision, ${lat}::double precision), 4326), 3826),
          NOW()
        )
        RETURNING id
      `;

      if (!result || result.length === 0) {
        throw new AppError('Failed to create point', 500);
      }

      const newPoint = result[0];

      await prisma.identity.update({
        where: { uuid },
        data: { count: newCount } as any,
      });

      const updatedAlpha = this.calculateAlpha(newCount);
      await (prisma as any).dangerPoint.updateMany({
        where: { uuid },
        data: { alpha: updatedAlpha },
      });

      return sendSuccess(
        res,
        {
          id: newPoint.id,
          uuid,
          uuuid,
          lat,
          lng: lon,
          alpha: updatedAlpha,
          type,
          time,
        },
        'Point created successfully',
        201
      );
    } catch (error) {
      next(error);
    }
  }

  async getPointsByUuid(req: Request, res: Response, next: NextFunction) {
    try {
      const { uuid } = req.params;

      if (!uuid) {
        throw new AppError('Missing uuid parameter', 400);
      }

      const points = await (prisma as any).dangerPoint.findMany({
        where: { uuid },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          uuuid: true,
          lat: true,
          lng: true,
          alpha: true,
          type: true,
          time: true,
        },
      });

      const totalAlpha = points.reduce((sum: number, p: { alpha: number }) => sum + p.alpha, 0);

      return sendSuccess(
        res,
        {
          count: points.length,
          total_alpha: totalAlpha,
          data: points.map((p: { id: number; uuuid: string; lat: number; lng: number; alpha: number; type: string; time: Date }) => ({
            id: p.id,
            uuuid: p.uuuid,
            lat: p.lat,
            lng: p.lng,
            alpha: p.alpha,
            type: p.type,
            time: p.time.toISOString(),
          })),
        },
        'Points retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async deletePoint(req: Request, res: Response, next: NextFunction) {
    try {
      const { uuid, uuuid } = req.body as {
        uuid: string;
        uuuid: string;
      };

      if (!uuid || !uuuid) {
        throw new AppError('Missing required fields: uuid, uuuid', 400);
      }

      const point = await (prisma as any).dangerPoint.findUnique({
        where: { uuuid },
      });

      if (!point) {
        throw new AppError('Point not found', 404);
      }

      if (point.uuid !== uuid) {
        throw new AppError('Point does not belong to this user', 403);
      }

      await (prisma as any).dangerPoint.delete({
        where: { uuuid },
      });

      const identity = await prisma.identity.findUnique({
        where: { uuid },
        select: {
          uuid: true,
          account: true,
          name: true,
          idNo: true,
          count: true,
          createdAt: true,
          updatedAt: true,
          id: true,
        } as any,
      }) as any;

      if (identity) {
        const newCount = Math.max(0, identity.count - 1);
        await prisma.identity.update({
          where: { uuid },
          data: { count: newCount } as any,
        });

        if (newCount > 0) {
          const updatedAlpha = this.calculateAlpha(newCount);
          await (prisma as any).dangerPoint.updateMany({
            where: { uuid },
            data: { alpha: updatedAlpha },
          });
        }

        return sendSuccess(
          res,
          {
            message: 'Point deleted and alpha recalculated',
            remaining_points: newCount,
            new_alpha: newCount > 0 ? this.calculateAlpha(newCount) : 0,
          },
          'Point deleted successfully'
        );
      }

      return sendSuccess(
        res,
        {
          message: 'Point deleted',
          remaining_points: 0,
          new_alpha: 0,
        },
        'Point deleted successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export default new DangerPointsModule();

