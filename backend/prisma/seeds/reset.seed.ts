import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 清空資料庫所有資料
 * 警告：此操作會刪除所有資料！
 */
const resetDatabase = async () => {
  console.log('⚠️  WARNING: This will delete ALL data from the database!');
  console.log('Starting database reset...\n');

  try {
    // 按照外鍵依賴順序刪除（從子表到父表）
    
    // 1. 刪除 SafetySignal (有外鍵指向 Grid)
    console.log('Deleting safety signals...');
    const deletedSignals = await prisma.safetySignal.deleteMany({});
    console.log(`✅ Deleted ${deletedSignals.count} safety signals`);

    // 2. 刪除 Grid
    console.log('Deleting grids...');
    const deletedGrids = await prisma.grid.deleteMany({});
    console.log(`✅ Deleted ${deletedGrids.count} grids`);

    // 3. 刪除其他表（沒有外鍵依賴）
    console.log('Deleting CCTV...');
    const deletedCctv = await prisma.cctv.deleteMany({});
    console.log(`✅ Deleted ${deletedCctv.count} CCTV records`);

    console.log('Deleting safe places...');
    const deletedSafePlaces = await prisma.safePlace.deleteMany({});
    console.log(`✅ Deleted ${deletedSafePlaces.count} safe places`);

    console.log('Deleting not safe places...');
    const deletedNotSafe = await prisma.notSafe.deleteMany({});
    console.log(`✅ Deleted ${deletedNotSafe.count} not safe places`);

    console.log('Deleting places...');
    const deletedPlaces = await prisma.place.deleteMany({});
    console.log(`✅ Deleted ${deletedPlaces.count} places`);

    console.log('Deleting danger points...');
    const deletedDangerPoints = await (prisma as any).dangerPoint.deleteMany({});
    console.log(`✅ Deleted ${deletedDangerPoints.count} danger points`);

    console.log('Deleting identity records...');
    const deletedIdentity = await prisma.identity.deleteMany({});
    console.log(`✅ Deleted ${deletedIdentity.count} identity records`);

    console.log('\n🎉 Database reset completed successfully!');
    console.log('All tables have been cleared.');
  } catch (error) {
    console.error('❌ Error resetting database:', error);
    throw error;
  }
};

// 如果直接執行此檔案，則執行 reset
if (require.main === module) {
  resetDatabase()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

// 導出函數供統一腳本使用
export default resetDatabase;

