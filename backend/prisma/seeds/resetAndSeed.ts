/**
 * Reset 並重新 Seed 資料庫
 * 先清空所有資料，然後重新執行所有 seed
 */
import resetDatabase from './reset.seed';

// 複製 index.ts 的 runSeeds 邏輯，避免循環依賴
async function runSeeds() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // 1. 執行 identity seed（身份驗證資料/個資）
    console.log('🔐 Seeding identity...');
    const { default: seedIdentity } = await import('./identity.seed');
    await seedIdentity();
    console.log('✅ Identity seeded\n');

    // 2. 執行 safePlace seed（假的警察局/消防/避難所資料）
    console.log('📍 Seeding safe places (police/fire/shelter)...');
    const { default: seedSafePlaces } = await import('./safePlace.seed');
    await seedSafePlaces();
    console.log('✅ Safe places seeded\n');

    // 3. 執行 CCTV seed（使用 Cctv model）
    console.log('📹 Seeding CCTV (Cctv model)...');
    const { default: seedCctv } = await import('./cctv.seed');
    await seedCctv();
    console.log('✅ CCTV (Cctv model) seeded\n');

    // 4. 執行 places seed（真的 CCTV 資料，使用 Place model）
    console.log('📹 Seeding CCTV to Place model (from CSV)...');
    try {
      const { default: seedPlaces } = await import('./places.seed');
      await seedPlaces();
      console.log('✅ CCTV (Place model) seeded\n');
    } catch (error) {
      console.log('⚠️  CCTV (Place model) seed skipped (CSV file may not exist)\n');
    }

    // 5. 執行 notSafe seed
    console.log('⚠️  Seeding not safe places...');
    const { default: seedNotSafe } = await import('./notSafe.seed');
    await seedNotSafe();
    console.log('✅ Not safe places seeded\n');

    // 6. 執行 grids seed（可選）
    console.log('🗺️  Seeding grids...');
    try {
      const { default: seedGrids } = await import('./grids.seed');
      await seedGrids();
      console.log('✅ Grids seeded\n');
    } catch (error) {
      console.log('⚠️  Grids seed skipped (optional)\n');
    }

    // 7. 執行 dangerPoints seed（危險點位資料 - 測試用，10個點）
    console.log('⚠️  Seeding danger points (test data)...');
    try {
      const { default: seedDangerPoints } = await import('./dangerPoints.seed');
      await seedDangerPoints();
      console.log('✅ Danger points (test) seeded\n');
    } catch (error) {
      console.log('⚠️  Danger points (test) seed skipped (may need identity first)\n');
    }

    // 8. 執行 dangerPointsRandom seed（隨機生成 1000 個台北市點位）
    console.log('⚠️  Seeding random danger points (1000 Taipei City points)...');
    try {
      const { default: seedRandomDangerPoints } = await import('./dangerPointsRandom.seed');
      await seedRandomDangerPoints();
      console.log('✅ Random danger points seeded\n');
    } catch (error) {
      console.log('⚠️  Random danger points seed skipped\n');
    }

    console.log('🎉 All seeds completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

async function resetAndSeed() {
  console.log('🔄 Starting database reset and seed...\n');

  try {
    // 1. 先執行 reset
    console.log('🗑️  Resetting database...');
    await resetDatabase();
    console.log('✅ Database reset completed\n');

    // 2. 等待一下確保資料庫操作完成
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3. 執行所有 seed
    await runSeeds();

    console.log('\n🎉 Database reset and seed completed successfully!');
  } catch (error) {
    console.error('❌ Error during reset and seed:', error);
    throw error;
  }
}

// 如果直接執行此檔案，則執行 resetAndSeed
if (require.main === module) {
  resetAndSeed()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export default resetAndSeed;
