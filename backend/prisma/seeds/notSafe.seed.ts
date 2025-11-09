import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 不安全地點種子資料
 * 這些是匿名回報的不安全地點
 */
const seedNotSafe = async () => {
  console.log('Seeding not safe places...');

  // 範例：一些被標記為不安全的地點
  const notSafePlaces = [
    {
      lat: 25.0300,
      lng: 121.5600,
    },
    {
      lat: 25.0320,
      lng: 121.5620,
    },
    {
      lat: 25.0280,
      lng: 121.5580,
    },
  ];

  for (const place of notSafePlaces) {
    // 檢查是否已存在（根據座標，容許小誤差）
    const existing = await prisma.notSafe.findFirst({
      where: {
        lat: {
          gte: place.lat - 0.0001,
          lte: place.lat + 0.0001,
        },
        lng: {
          gte: place.lng - 0.0001,
          lte: place.lng + 0.0001,
        },
      },
    });

    if (!existing) {
      await prisma.notSafe.create({
        data: place,
      });
    }
  }

  console.log(`Seeded ${notSafePlaces.length} not safe places`);
};

// 如果直接執行此檔案，則執行 seed
if (require.main === module) {
  seedNotSafe()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

// 導出函數供統一腳本使用
export default seedNotSafe;

