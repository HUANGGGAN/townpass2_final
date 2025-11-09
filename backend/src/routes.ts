import { Router } from 'express';
import { validate } from './middlewares/validator';
import { authenticate } from './middlewares/auth';
import placesModule from './modules/places';
import routeModule from './modules/route';
import dangerPointsModule from './modules/danger-points';
import dangerZonesModule from './modules/danger-zones';
import authModule from './modules/auth';
import {
  getPlacesSchema,
  getPlaceByIdSchema,
  planRouteSchema,
  createPointSchema,
  getPointsByUuidSchema,
  deletePointSchema,
  getDangerZonesSchema,
  findForwardSafePlaceSchema,
  loginSchema,
  registerSchema,
} from './schemas';

const router = Router();

// 公開路由（不需要 JWT）
router.post('/auth/login', validate(loginSchema), authModule.login.bind(authModule));
router.post('/auth/register', validate(registerSchema), authModule.register.bind(authModule));
router.get('/auth/me', authenticate, authModule.getMe.bind(authModule));

// 所有其他路由都需要 JWT 驗證
router.use(authenticate);

router.get('/places', validate(getPlacesSchema), placesModule.getPlaces.bind(placesModule));
router.get('/places/:id', validate(getPlaceByIdSchema), placesModule.getPlaceById.bind(placesModule));
router.post('/route/plan', validate(planRouteSchema), routeModule.planRoute.bind(routeModule));
router.post('/route/search', validate(planRouteSchema), routeModule.searchNearby.bind(routeModule));
router.post('/route/find-forward-safe-place', validate(findForwardSafePlaceSchema), routeModule.findForwardSafePlace.bind(routeModule));

// 危險點位相關路由
router.post('/points', validate(createPointSchema), dangerPointsModule.createPoint.bind(dangerPointsModule));
router.get('/points/:uuid', validate(getPointsByUuidSchema), dangerPointsModule.getPointsByUuid.bind(dangerPointsModule));
router.delete('/points', validate(deletePointSchema), dangerPointsModule.deletePoint.bind(dangerPointsModule));

// 危險區域查詢路由
router.post('/danger-zones', validate(getDangerZonesSchema), dangerZonesModule.getDangerZones.bind(dangerZonesModule));

export default router;

