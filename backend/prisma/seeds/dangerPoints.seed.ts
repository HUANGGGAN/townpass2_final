import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

/**
 * 危險點位種子資料
 * 
 * 重要說明：
 * 1. DangerPoint 代表"不安全的地點"（壞的點位）
 *    - 這些是用戶報告的不安全地點
 *    - 類型：light（輕微）、few（少量）、monitor（監控）、dangerous（危險）
 * 
 * 2. 群集計算方式：
 *    - 此 seed 會生成隨機點位，讓 DBSCAN 演算法自動計算群集
 *    - 不需要手動設計群集，後端會根據點位密度自動識別
 *    - 當你往資料庫丟一堆點時，後端會自動用 DBSCAN 算成群集
 */
const seedDangerPoints = async () => {
  console.log('Seeding danger points...');

  // 使用現有的 identity UUID（如果存在）
  const identity = await prisma.identity.findFirst({
    where: {
      uuid: '7f3562f4-bb3f-4ec7-89b9-da3b4b5ff250', // 從 identity seed 來的 UUID
    },
  });

  if (!identity) {
    console.log('⚠️  No identity found, skipping danger points seed');
    return;
  }

  const uuid = identity.uuid;

  // 創建隨機測試點位（集中在 25.024099, 121.535751 附近）
  // 讓 DBSCAN 自動計算群集，而不是手動設計群集
  const centerLat = 25.024099;
  const centerLng = 121.535751;
  
  // 生成隨機偏移的輔助函數
  const latOffset = (meters: number) => meters / 111000; // 1 度約 111 公里
  const lngOffset = (meters: number) => meters / (111000 * Math.cos(centerLat * Math.PI / 180));
  const randomOffset = (max: number) => (Math.random() - 0.5) * max * 2;

  // 定義類型列表，用於隨機分配
  const types: Array<'light' | 'few' | 'monitor' | 'dangerous'> = ['light', 'few', 'monitor', 'dangerous'];
  
  // 生成隨機點位（約 50 個點，讓 DBSCAN 自動計算群集）
  // 策略：在幾個區域內隨機生成點，讓 DBSCAN 自動識別群集
  const testPoints: Array<{ lat: number; lng: number; time: string; type: 'light' | 'few' | 'monitor' | 'dangerous' }> = [];
  
  // 區域 1：中心區域（會形成高密度群集）
  for (let i = 0; i < 12; i++) {
    const offset = randomOffset(150); // 150 公尺範圍內
    testPoints.push({
      lat: centerLat + latOffset(offset),
      lng: centerLng + lngOffset(offset),
      time: `2025-11-08T${10 + Math.floor(i / 2)}:${String((i % 2) * 30).padStart(2, '0')}:00:000000`,
      type: types[Math.floor(Math.random() * types.length)],
    });
  }
  
  // 區域 2：東北區域（會形成中等密度群集）
  for (let i = 0; i < 8; i++) {
    const baseOffset = 400;
    const offset = baseOffset + randomOffset(100);
    testPoints.push({
      lat: centerLat + latOffset(offset),
      lng: centerLng + lngOffset(offset),
      time: `2025-11-08T${11 + Math.floor(i / 2)}:${String((i % 2) * 30).padStart(2, '0')}:00:000000`,
      type: types[Math.floor(Math.random() * types.length)],
    });
  }
  
  // 區域 3：東南區域（會形成低密度群集）
  for (let i = 0; i < 6; i++) {
    const baseOffset = 700;
    const offset = baseOffset + randomOffset(150);
    testPoints.push({
      lat: centerLat + latOffset(offset),
      lng: centerLng + lngOffset(offset),
      time: `2025-11-08T${12 + Math.floor(i / 2)}:${String((i % 2) * 30).padStart(2, '0')}:00:000000`,
      type: types[Math.floor(Math.random() * types.length)],
    });
  }
  
  // 區域 4：西南區域（會形成小群集）
  for (let i = 0; i < 5; i++) {
    const baseOffset = 1000;
    const offset = baseOffset + randomOffset(120);
    testPoints.push({
      lat: centerLat + latOffset(offset),
      lng: centerLng + lngOffset(offset),
      time: `2025-11-08T${13 + Math.floor(i / 2)}:${String((i % 2) * 30).padStart(2, '0')}:00:000000`,
      type: types[Math.floor(Math.random() * types.length)],
    });
  }
  
  // 隨機分散的點（會成為噪音點）
  for (let i = 0; i < 15; i++) {
    const offset = randomOffset(2000); // 2 公里範圍內隨機
    testPoints.push({
      lat: centerLat + latOffset(offset),
      lng: centerLng + lngOffset(offset),
      time: `2025-11-08T${14 + Math.floor(i / 3)}:${String((i % 3) * 20).padStart(2, '0')}:00:000000`,
      type: types[Math.floor(Math.random() * types.length)],
    });
  }

  let created = 0;
  let skipped = 0;

  // 獲取當前點數
  const currentCount = await (prisma as any).dangerPoint.count({
    where: { uuid },
  });

  // 計算總點數（當前 + 即將新增的）
  const totalCount = currentCount + testPoints.length;
  
  // 為了測試不同的 alpha 效果，我們設計不同的場景
  // 但為了簡化，我們先計算一個統一的 alpha（實際使用時會自動更新）
  // 注意：實際的 alpha 會在插入後統一更新
  const baseAlpha = totalCount > 0 ? 1 / totalCount : 0;

  // 先插入所有點位（使用臨時 alpha 值）
  for (const point of testPoints) {
    try {
      // 解析時間（支援新格式：YYYY-MM-DDTHH:mm:ss:SSSSSS）
      const timeStr = point.time.replace(/:\d{6}$/, ''); // 移除最後的 :000000
      const timeDate = new Date(timeStr);

      // 生成 uuuid
      const uuuid = randomUUID();

      // 創建點位（使用原生 SQL 處理 PostGIS geometry）
      // 注意：資料庫欄位名稱是 camelCase（createdAt）
      // 使用臨時 alpha 值，稍後會統一更新
      await prisma.$queryRawUnsafe(`
        INSERT INTO danger_points (uuid, uuuid, alpha, type, time, lat, lng, geom, "createdAt")
        VALUES (
          '${uuid.replace(/'/g, "''")}'::text,
          '${uuuid.replace(/'/g, "''")}'::text,
          ${baseAlpha}::double precision,
          '${point.type}'::"DangerPointType",
          '${timeDate.toISOString()}'::timestamp,
          ${point.lat}::double precision,
          ${point.lng}::double precision,
          ST_Transform(ST_SetSRID(ST_MakePoint(${point.lng}::double precision, ${point.lat}::double precision), 4326), 3826),
          NOW()
        )
      `);

      created++;
    } catch (error) {
      console.warn(`Failed to create point at (${point.lat}, ${point.lng}):`, error);
      skipped++;
    }
  }

  // 更新 Identity.count
  const finalCount = await (prisma as any).dangerPoint.count({
    where: { uuid },
  });

  await prisma.identity.update({
    where: { uuid },
    data: { count: finalCount } as any,
  });

  // 更新所有點位的 alpha 值
  const updatedAlpha = finalCount > 0 ? 1 / finalCount : 0;
  await (prisma as any).dangerPoint.updateMany({
    where: { uuid },
    data: { alpha: updatedAlpha },
  });

  console.log(`Seeded ${created} danger points (${skipped} skipped)`);
  console.log(`Total points for user: ${finalCount}, alpha: ${updatedAlpha}`);
};

// 如果直接執行此檔案，則執行 seed
if (require.main === module) {
  seedDangerPoints()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

// 導出函數供統一腳本使用
export default seedDangerPoints;

