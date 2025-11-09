import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { buildDatabaseUrl } from '../../src/config/databaseUrl';

dotenv.config();
buildDatabaseUrl();

const prisma = new PrismaClient();

/**
 * 隨機生成台北市的危險點位資料
 * - 生成 1000 個點位
 * - 只分配 10 個給 default user
 * - 其他 990 個分配給隨機用戶（每個用戶最多 10 個點）
 * - 使用 NLSC API 確認座標在台北市
 */
const seedRandomDangerPoints = async () => {
  console.log('🌱 Starting random danger points seeding...');

  // 台北市的大致範圍
  // 緯度：24.9 - 25.2
  // 經度：121.4 - 121.7
  const minLat = 25.035;
  const maxLat = 25.05;
  const minLng = 121.51;
  const maxLng = 121.57;

  // 獲取 default user
  const defaultIdentity = await prisma.identity.findFirst({
    where: {
      uuid: '7f3562f4-bb3f-4ec7-89b9-da3b4b5ff250',
    },
  });

  if (!defaultIdentity) {
    console.log('⚠️  Default identity not found, skipping random danger points seed');
    return;
  }

  const types: Array<'light' | 'few' | 'monitor' | 'dangerous'> = ['light', 'few', 'monitor', 'dangerous'];
  
  // 用於存儲已驗證的台北市座標
  const validPoints: Array<{
    lat: number;
    lng: number;
    type: 'light' | 'few' | 'monitor' | 'dangerous';
    time: string;
  }> = [];

  console.log('📍 Generating and validating Taipei City coordinates...');
  let attempts = 0;
  const maxAttempts = 5000; // 最多嘗試 5000 次，確保能找到 1000 個有效點

  // 驗證座標是否在台北市的函數
  // API 格式：https://api.nlsc.gov.tw/other/TownVillagePointQuery/{lng}/{lat}/4326
  const validateTaipeiCity = async (lat: number, lng: number): Promise<boolean> => {
    try {
      const url = `https://api.nlsc.gov.tw/other/TownVillagePointQuery/${lng}/${lat}/4326`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000), // 5 秒超時
      });
      
      if (!response.ok) {
        return false;
      }

      const xmlText = await response.text();
      const cityMatch = xmlText.match(/<ctyName>([^<]+)<\/ctyName>/);
      const city = cityMatch ? cityMatch[1] : null;
      
      return city === '臺北市' || city === '台北市';
    } catch (error) {
      return false;
    }
  };

  // 生成並驗證點位
  while (validPoints.length < 1000 && attempts < maxAttempts) {
    attempts++;
    
    // 隨機生成座標
    const lat = minLat + Math.random() * (maxLat - minLat);
    const lng = minLng + Math.random() * (maxLng - minLng);

    // 驗證是否在台北市
    const isValid = await validateTaipeiCity(lat, lng);
    
    if (isValid) {
      const type = types[Math.floor(Math.random() * types.length)];
      const hours = Math.floor(Math.random() * 24);
      const minutes = Math.floor(Math.random() * 60);
      const seconds = Math.floor(Math.random() * 60);
      const time = `2025-11-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:000000`;
      
      validPoints.push({ lat, lng, type, time });
      
      if (validPoints.length % 100 === 0) {
        console.log(`  ✅ Found ${validPoints.length} valid Taipei City points...`);
      }
    }

    // 避免 API 請求過快（每 5 個請求暫停一下）
    if (attempts % 5 === 0) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  if (validPoints.length < 1000) {
    console.log(`⚠️  Only found ${validPoints.length} valid points after ${attempts} attempts`);
  }

  console.log(`\n📊 Total valid points: ${validPoints.length}`);
  console.log('💾 Inserting points into database...\n');

  // 分配點位：10 個給 default user，其他 990 個分配給隨機用戶
  const defaultUserPoints = validPoints.slice(0, 10);
  const otherPoints = validPoints.slice(10);

  // 創建或獲取其他用戶的 UUID 列表
  const otherUserUuids: string[] = [];
  const usersToCreate = Math.ceil(otherPoints.length / 10); // 每個用戶最多 10 個點

  for (let i = 0; i < usersToCreate; i++) {
    const account = `random_user_${i + 1}`;
    let identity = await prisma.identity.findUnique({
      where: { account },
    });

    if (!identity) {
      identity = await prisma.identity.create({
        data: {
          account,
          uuid: randomUUID(),
          name: `Random User ${i + 1}`,
          idNo: `R${String(i + 1).padStart(8, '0')}`,
          count: 0,
        } as any,
      });
    }

    otherUserUuids.push(identity.uuid);
  }

  // 插入 default user 的 10 個點
  let defaultCreated = 0;
  console.log(`👤 Inserting 10 points for default user...`);
  
  for (const point of defaultUserPoints) {
    try {
      const timeStr = point.time.replace(/:\d{6}$/, '');
      const timeDate = new Date(timeStr);
      const uuuid = randomUUID();

      // 獲取當前點數
      const currentCount = await (prisma as any).dangerPoint.count({
        where: { uuid: defaultIdentity.uuid },
      });
      
      // 確保 default user 不超過 10 個點
      if (currentCount >= 10) {
        console.log(`⚠️  Default user already has ${currentCount} points, skipping...`);
        break; // 停止插入 default user 的點
      }
      
      const newCount = currentCount + 1;
      const alpha = newCount > 0 ? 1 / newCount : 0;

      await prisma.$queryRawUnsafe(`
        INSERT INTO danger_points (uuid, uuuid, alpha, type, time, lat, lng, geom, "createdAt")
        VALUES (
          '${defaultIdentity.uuid.replace(/'/g, "''")}'::text,
          '${uuuid.replace(/'/g, "''")}'::text,
          ${alpha}::double precision,
          '${point.type}'::"DangerPointType",
          '${timeDate.toISOString()}'::timestamp,
          ${point.lat}::double precision,
          ${point.lng}::double precision,
          ST_Transform(ST_SetSRID(ST_MakePoint(${point.lng}::double precision, ${point.lat}::double precision), 4326), 3826),
          NOW()
        )
      `);

      // 更新 alpha 值（因為新增了點）
      const updatedAlpha = newCount > 0 ? 1 / newCount : 0;
      await (prisma as any).dangerPoint.updateMany({
        where: { uuid: defaultIdentity.uuid },
        data: { alpha: updatedAlpha },
      });

      defaultCreated++;
    } catch (error) {
      console.warn(`Failed to create point for default user:`, error);
    }
  }

  // 更新 default user 的 count
  const defaultFinalCount = await (prisma as any).dangerPoint.count({
    where: { uuid: defaultIdentity.uuid },
  });
  await prisma.identity.update({
    where: { uuid: defaultIdentity.uuid },
    data: { count: defaultFinalCount } as any,
  });

  console.log(`✅ Inserted ${defaultCreated} points for default user`);

  // 插入其他用戶的點位
  let otherCreated = 0;
  console.log(`\n👥 Inserting ${otherPoints.length} points for other users...`);

  for (let i = 0; i < otherPoints.length; i++) {
    const point = otherPoints[i];
    const userIndex = Math.floor(i / 10); // 每個用戶最多 10 個點
    const userUuid = otherUserUuids[userIndex];

    try {
      const timeStr = point.time.replace(/:\d{6}$/, '');
      const timeDate = new Date(timeStr);
      const uuuid = randomUUID();

      // 獲取當前點數
      const currentCount = await (prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM danger_points
        WHERE uuid = ${userUuid}::text
      `) as any;

      const count = Number(currentCount[0]?.count || 0);
      
      // 確保每個用戶不超過 10 個點
      if (count >= 10) {
        continue; // 跳過這個點，這個用戶已經有 10 個點了
      }
      
      const newCount = count + 1;
      const alpha = newCount > 0 ? 1 / newCount : 0;

      await prisma.$queryRawUnsafe(`
        INSERT INTO danger_points (uuid, uuuid, alpha, type, time, lat, lng, geom, "createdAt")
        VALUES (
          '${userUuid.replace(/'/g, "''")}'::text,
          '${uuuid.replace(/'/g, "''")}'::text,
          ${alpha}::double precision,
          '${point.type}'::"DangerPointType",
          '${timeDate.toISOString()}'::timestamp,
          ${point.lat}::double precision,
          ${point.lng}::double precision,
          ST_Transform(ST_SetSRID(ST_MakePoint(${point.lng}::double precision, ${point.lat}::double precision), 4326), 3826),
          NOW()
        )
      `);

      // 更新 alpha 值
      const updatedAlpha = newCount > 0 ? 1 / newCount : 0;
      await prisma.$executeRaw`
        UPDATE danger_points
        SET alpha = ${updatedAlpha}::double precision
        WHERE uuid = ${userUuid}::text
      `;

      otherCreated++;

      if (otherCreated % 100 === 0) {
        console.log(`  ✅ Inserted ${otherCreated}/${otherPoints.length} points...`);
      }
    } catch (error) {
      console.warn(`Failed to create point for user ${userUuid}:`, error);
    }
  }

  // 更新所有其他用戶的 count
  for (const userUuid of otherUserUuids) {
    const finalCount = await (prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM danger_points
      WHERE uuid = ${userUuid}::text
    `) as any;

    const count = Number(finalCount[0]?.count || 0);
    await prisma.identity.update({
      where: { uuid: userUuid },
      data: { count } as any,
    });
  }

  console.log(`\n✅ Inserted ${otherCreated} points for other users`);
  console.log(`\n🎉 Total: ${defaultCreated + otherCreated} points inserted`);
  console.log(`   - Default user: ${defaultCreated} points`);
  console.log(`   - Other users: ${otherCreated} points`);
};

// 如果直接執行此檔案，則執行 seed
if (require.main === module) {
  seedRandomDangerPoints()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

// 導出函數供統一腳本使用
export default seedRandomDangerPoints;

