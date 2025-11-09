import { PrismaClient } from '@prisma/client';
import { getGridId, getGridCenter } from '../../src/utils/geoUtils';

const prisma = new PrismaClient();

/**
 * 預先計算並建立格網
 * 這裡提供一個範例，實際使用時應該根據需要覆蓋的區域來建立
 */
const seedGrids = async () => {
  console.log('Seeding grids...');

  // 範例：台北市範圍的格網（約 25.0-25.1, 121.5-121.6）
  const minLat = 25.0;
  const maxLat = 25.1;
  const minLng = 121.5;
  const maxLng = 121.6;

  const grids: Array<{ gridId: string; centerLat: number; centerLng: number }> = [];

  // 產生格網
  for (let lat = minLat; lat < maxLat; lat += 1) {
    for (let lng = minLng; lng < maxLng; lng += 1) {
      const gridId = getGridId(lat, lng);
      const center = getGridCenter(gridId);
      grids.push({ gridId, centerLat: center.lat, centerLng: center.lng });
    }
  }

  // 批量建立
  for (const grid of grids) {
    await prisma.grid.upsert({
      where: { gridId: grid.gridId },
      update: {
        centerLat: grid.centerLat,
        centerLng: grid.centerLng,
      },
      create: grid,
    });
  }

  console.log(`Created ${grids.length} grids`);
};

// 如果直接執行此檔案，則執行 seed
if (require.main === module) {
  seedGrids()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

// 導出函數供統一腳本使用
export default seedGrids;

