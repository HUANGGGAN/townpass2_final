import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { AppError } from '../middlewares/errorHandler';

function getRiskLevel(alpha: number): 'critical' | 'high' | 'medium' | 'low' {
  if (alpha > 5.0) return 'critical';
  if (alpha > 2.0) return 'high';
  if (alpha > 1.0) return 'medium';
  return 'low';
}

class DangerZonesModule {
  async getDangerZones(req: Request, res: Response, next: NextFunction) {
    try {
      const { time, lat, lng, radius, eps, minpoints, maxPointsPerCluster } = req.body as {
        time?: string;
        lat: number;
        lng: number;
        radius: number;
        eps?: number;
        minpoints?: number;
        maxPointsPerCluster?: number;
      };

      if (lat === undefined || lng === undefined || radius === undefined) {
        throw new AppError('Missing required fields: lat, lng, radius', 400);
      }

      if (typeof lat !== 'number' || typeof lng !== 'number' || typeof radius !== 'number') {
        throw new AppError('lat, lng, and radius must be numbers', 400);
      }

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new AppError('Invalid coordinate range', 400);
      }

      if (radius <= 0) {
        throw new AppError('radius must be positive', 400);
      }

      // Dynamic eps calculation: eps should be proportional to radius but smaller
      // Default: eps = radius / 5, with min 50m and max 300m
      // This ensures more clusters are formed when radius is large
      const defaultEps = Math.max(50, Math.min(300, radius / 5));
      const epsValue = eps || defaultEps;
      
      // minpoints should also be adjusted based on expected point density
      // Default: 3 points minimum, but can be adjusted based on radius
      const defaultMinpoints = radius > 1000 ? 5 : 3;
      const minpointsValue = minpoints || defaultMinpoints;
      
      // Max points per cluster: if a cluster exceeds this, it will be split
      // Default: 20 points per cluster
      const maxPointsPerClusterValue = maxPointsPerCluster || 20;
      const clusters = await prisma.$queryRaw<Array<{
        cluster_id: number | bigint | null;
        point_count: bigint;
        alpha_sum: number;
        centroid_lat: number;
        centroid_lng: number;
        type_counts: string;
      }>>`
        WITH points_in_range AS (
          SELECT 
            id,
            uuid,
            alpha,
            type,
            lat,
            lng,
            geom
          FROM danger_points
          WHERE ST_DWithin(
            geom,
            ST_Transform(ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326), 3826),
            ${radius}::double precision
          )
        ),
        clustered_points AS (
          SELECT 
            id,
            uuid,
            alpha,
            type,
            lat,
            lng,
            geom,
            ST_ClusterDBSCAN(geom, ${epsValue}::double precision, ${minpointsValue}::integer) 
              OVER (ORDER BY id) AS cluster_id
          FROM points_in_range
        ),
        cluster_stats AS (
          SELECT 
            cluster_id,
            COUNT(*)::bigint AS point_count
          FROM clustered_points
          WHERE cluster_id IS NOT NULL
          GROUP BY cluster_id
        ),
        split_clusters AS (
          SELECT 
            cp.id,
            cp.uuid,
            cp.alpha,
            cp.type,
            cp.lat,
            cp.lng,
            cp.geom,
            CASE 
              WHEN cs.point_count > ${maxPointsPerClusterValue} THEN
                -- Split large clusters: create sub-cluster ID based on row number
                (cp.cluster_id::bigint * 10000 + 
                 (ROW_NUMBER() OVER (PARTITION BY cp.cluster_id ORDER BY cp.id) - 1) / ${maxPointsPerClusterValue})
              ELSE
                cp.cluster_id::bigint
            END AS cluster_id
          FROM clustered_points cp
          JOIN cluster_stats cs ON cp.cluster_id = cs.cluster_id
          WHERE cp.cluster_id IS NOT NULL
        )
        SELECT 
          cluster_id,
          COUNT(*)::bigint AS point_count,
          SUM(alpha)::double precision AS alpha_sum,
          ST_Y(ST_Transform(ST_Centroid(ST_Collect(geom)), 4326))::double precision AS centroid_lat,
          ST_X(ST_Transform(ST_Centroid(ST_Collect(geom)), 4326))::double precision AS centroid_lng
        FROM split_clusters
        GROUP BY cluster_id
        ORDER BY SUM(alpha) DESC
      `;

      const totalPointsInRange = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM danger_points
        WHERE ST_DWithin(
          geom,
          ST_Transform(ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326), 3826),
          ${radius}::double precision
        )
      `;

      const totalPoints = Number(totalPointsInRange[0]?.count || 0);

      const clusterTypeStats = await prisma.$queryRaw<Array<{
        cluster_id: number | bigint;
        type: string;
        count: bigint;
      }>>`
        WITH points_in_range AS (
          SELECT 
            id,
            type,
            geom
          FROM danger_points
          WHERE ST_DWithin(
            geom,
            ST_Transform(ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326), 3826),
            ${radius}::double precision
          )
        ),
        clustered_points AS (
          SELECT 
            id,
            type,
            ST_ClusterDBSCAN(geom, ${epsValue}::double precision, ${minpointsValue}::integer) 
              OVER (ORDER BY id) AS cluster_id
          FROM points_in_range
        ),
        cluster_stats AS (
          SELECT 
            cluster_id,
            COUNT(*)::bigint AS point_count
          FROM clustered_points
          WHERE cluster_id IS NOT NULL
          GROUP BY cluster_id
        ),
        split_clusters AS (
          SELECT 
            cp.id,
            cp.type,
            CASE 
              WHEN cs.point_count > ${maxPointsPerClusterValue} THEN
                (cp.cluster_id::bigint * 10000 + 
                 (ROW_NUMBER() OVER (PARTITION BY cp.cluster_id ORDER BY cp.id) - 1) / ${maxPointsPerClusterValue})
              ELSE
                cp.cluster_id::bigint
            END AS cluster_id
          FROM clustered_points cp
          JOIN cluster_stats cs ON cp.cluster_id = cs.cluster_id
          WHERE cp.cluster_id IS NOT NULL
        )
        SELECT 
          cluster_id::integer,
          type::text,
          COUNT(*)::bigint AS count
        FROM split_clusters
        GROUP BY cluster_id, type
        ORDER BY cluster_id, type
      `;

      const typeStatsMap = new Map<number, Record<string, number>>();
      clusterTypeStats.forEach((stat: {
        cluster_id: number | bigint;
        type: string;
        count: bigint;
      }) => {
        const clusterId = typeof stat.cluster_id === 'bigint' 
          ? Number(stat.cluster_id) 
          : Number(stat.cluster_id);
        if (!typeStatsMap.has(clusterId)) {
          typeStatsMap.set(clusterId, {});
        }
        const stats = typeStatsMap.get(clusterId)!;
        stats[stat.type] = Number(stat.count);
      });

      const noisePointsData = await prisma.$queryRaw<Array<{
        id: number;
        lat: number;
        lng: number;
        alpha: number;
        type: string;
      }>>`
        WITH points_in_range AS (
          SELECT 
            id,
            lat,
            lng,
            alpha,
            type,
            geom,
            ST_ClusterDBSCAN(geom, ${epsValue}::double precision, ${minpointsValue}::integer) 
              OVER (ORDER BY id) AS cluster_id
          FROM danger_points
          WHERE ST_DWithin(
            geom,
            ST_Transform(ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326), 3826),
            ${radius}::double precision
          )
        )
        SELECT 
          id,
          lat::double precision,
          lng::double precision,
          alpha::double precision,
          type::text
        FROM points_in_range
        WHERE cluster_id IS NULL
        ORDER BY alpha DESC
      `;

      const noiseCount = noisePointsData.length;
      const formattedNoisePoints = noisePointsData.map((point: {
        id: number;
        lat: number;
        lng: number;
        alpha: number;
        type: string;
      }) => ({
        id: point.id,
        lat: Number(point.lat),
        lng: Number(point.lng),
        alpha: Number(point.alpha),
        type: point.type,
      }));

      const clustersAlphaSum = clusters.reduce((sum: number, c: {
        cluster_id: number | bigint | null;
        point_count: bigint;
        alpha_sum: number;
        centroid_lat: number;
        centroid_lng: number;
        type_counts: string;
      }) => sum + Number(c.alpha_sum), 0);
      const noiseAlphaSum = formattedNoisePoints.reduce((sum: number, p: {
        id: number;
        lat: number;
        lng: number;
        alpha: number;
        type: string;
      }) => sum + p.alpha, 0);
      const totalAlphaSum = clustersAlphaSum + noiseAlphaSum;

      const formattedClusters = clusters.map((cluster: {
        cluster_id: number | bigint | null;
        point_count: bigint;
        alpha_sum: number;
        centroid_lat: number;
        centroid_lng: number;
        type_counts: string;
      }, index: number) => {
        // Convert cluster_id to number, handling both number and bigint cases
        const rawClusterId = cluster.cluster_id;
        const clusterId = rawClusterId !== null && rawClusterId !== undefined 
          ? (typeof rawClusterId === 'bigint' ? Number(rawClusterId) : Number(rawClusterId))
          : index;
        const typeStats = typeStatsMap.get(clusterId) || {};

        return {
          cluster_id: Number(clusterId),
          point_count: Number(cluster.point_count),
          alpha: Number(cluster.alpha_sum),
          lat: Number(cluster.centroid_lat),
          lng: Number(cluster.centroid_lng),
          risk_level: getRiskLevel(Number(cluster.alpha_sum)),
          type_counts: {
            light: Number(typeStats.light || 0),
            few: Number(typeStats.few || 0),
            monitor: Number(typeStats.monitor || 0),
            dangerous: Number(typeStats.dangerous || 0),
          },
        };
      });

      const geojson = {
        type: 'FeatureCollection' as const,
        features: [
          ...formattedClusters.map((cluster: {
            cluster_id: number;
            point_count: number;
            alpha: number;
            lat: number;
            lng: number;
            risk_level: 'critical' | 'high' | 'medium' | 'low';
            type_counts: {
              light: number;
              few: number;
              monitor: number;
              dangerous: number;
            };
          }) => ({
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [cluster.lng, cluster.lat],
            },
            properties: {
              type: 'cluster',
              cluster_id: cluster.cluster_id,
              alpha: cluster.alpha,
              risk_level: cluster.risk_level,
              point_count: cluster.point_count,
              type_counts: cluster.type_counts,
            },
          })),
          ...formattedNoisePoints.map((point: {
            id: number;
            lat: number;
            lng: number;
            alpha: number;
            type: string;
          }) => ({
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [point.lng, point.lat],
            },
            properties: {
              type: 'noise',
              id: point.id,
              alpha: point.alpha,
              point_type: point.type,
            },
          })),
        ],
      };

      return sendSuccess(
        res,
        {
          query: {
            center: { lat, lng },
            radius,
            eps: epsValue,
            minpoints: minpointsValue,
            maxPointsPerCluster: maxPointsPerClusterValue,
          },
          statistics: {
            total_points_in_range: totalPoints,
            clusters_found: formattedClusters.length,
            noise_points: noiseCount,
            total_alpha_sum: totalAlphaSum,
            clusters_alpha_sum: clustersAlphaSum,
            noise_alpha_sum: noiseAlphaSum,
          },
          clusters: formattedClusters,
          noise_points: formattedNoisePoints,
          geojson,
        },
        'Danger zones retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export default new DangerZonesModule();

