import { z } from 'zod';

export const getPlacesSchema = z.object({
  query: z.object({
    lat: z
      .string()
      .optional()
      .transform((val) => (val ? parseFloat(val) : undefined)),
    lng: z
      .string()
      .optional()
      .transform((val) => (val ? parseFloat(val) : undefined)),
    type: z.enum(['police', 'fire', 'shelter']).optional(), // 只支援安全地點類型，CCTV 用 /cctv 端點
    radius: z
      .string()
      .optional()
      .transform((val) => (val ? parseFloat(val) : undefined)),
  }),
});

export const getPlaceByIdSchema = z.object({
  params: z.object({
    id: z.string().transform((val) => parseInt(val, 10)),
  }),
});

export const createSignalSchema = z.object({
  body: z.object({
    gridId: z.string().regex(/^\d+_\d+$/, 'Invalid grid ID format'),
    signal: z.enum(['unsafe', 'ok']),
    timeslot: z.string().datetime().optional(),
  }),
});

// 自定義時間格式驗證：YYYY-MM-DDTHH:mm:ss:SSSSSS (例如: 2025-11-08T23:08:00:000000)
const timeFormatRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}:\d{6}$/;

export const planRouteSchema = z.object({
  body: z.object({
    points: z.array(
      z.object({
        id: z.number().int().min(0).max(9),
        time: z.string().regex(timeFormatRegex, 'Time format must be YYYY-MM-DDTHH:mm:ss:SSSSSS (e.g., 2025-11-08T23:08:00:000000)'),
        lat: z.number(),
        lng: z.number(),
      })
    ).min(1).max(10),
  }),
});

// 危險點位相關 Schema
export const createPointSchema = z.object({
  body: z.object({
    uuid: z.string().uuid('Invalid UUID format'),
    time: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}:\d{6}$/, 'Time format must be YYYY-MM-DDTHH:mm:ss:SSSSSS'),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    type: z.enum(['light', 'few', 'monitor', 'dangerous'], {
      errorMap: () => ({ message: 'Type must be one of: light, few, monitor, dangerous' }),
    }),
  }),
});

export const getPointsByUuidSchema = z.object({
  params: z.object({
    uuid: z.string().uuid('Invalid UUID format'),
  }),
});

export const deletePointSchema = z.object({
  body: z.object({
    uuid: z.string().uuid('Invalid UUID format'),
    uuuid: z.string().uuid('Invalid UUID format'),
  }),
});

export const getDangerZonesSchema = z.object({
  body: z.object({
    time: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}:\d{6}$/, 'Time format must be YYYY-MM-DDTHH:mm:ss:SSSSSS').optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radius: z.number().positive('Radius must be positive'),
    eps: z.number().positive('Eps must be positive').optional(),
    minpoints: z.number().int().min(1, 'Minpoints must be at least 1').optional(),
    maxPointsPerCluster: z.number().int().min(1, 'MaxPointsPerCluster must be at least 1').optional(),
  }),
});

export const findForwardSafePlaceSchema = z.object({
  body: z.object({
    points: z.array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
    ).min(2, 'Must provide at least 2 points to determine direction').max(10, 'Maximum 10 points allowed'),
    radius: z.number().positive('Radius must be positive'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    uuid: z.string().uuid('Invalid UUID format'),
    idNo: z.string().min(1, 'ID number is required'),
  }),
});

export const registerSchema = z.object({
  body: z.object({
    account: z.string().min(1, 'Account is required'),
    idNo: z.string().min(1, 'ID number is required'),
    name: z.string().min(1, 'Name is required'),
  }),
});

export type GetPlacesQuery = z.infer<typeof getPlacesSchema>['query'];
export type GetPlaceByIdParams = z.infer<typeof getPlaceByIdSchema>['params'];
export type CreateSignalBody = z.infer<typeof createSignalSchema>['body'];
export type PlanRouteBody = z.infer<typeof planRouteSchema>['body'];
export type CreatePointBody = z.infer<typeof createPointSchema>['body'];
export type GetPointsByUuidParams = z.infer<typeof getPointsByUuidSchema>['params'];
export type DeletePointBody = z.infer<typeof deletePointSchema>['body'];
export type GetDangerZonesBody = z.infer<typeof getDangerZonesSchema>['body'];

