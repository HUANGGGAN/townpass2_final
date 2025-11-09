import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * CCTV 種子資料
 * 從 CSV 檔案讀取 CCTV 資料
 */
const seedCctv = async () => {
  console.log('Seeding CCTV from CSV...');

  const csvPath = path.join(__dirname, '../../assets/crawler_results_with_offset.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    return;
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');

  // 跳過標題行
  const dataLines = lines.slice(1);
  console.log(`Found ${dataLines.length} data lines in CSV (excluding header)`);

  const cctvList: Array<{
    uuid: string;
    owner: string;
    lat: number;
    lng: number;
  }> = [];

  // 解析 CSV 資料
  // 格式：zip(忽略), id(UUID), station(owner), address(忽略), dir_cn(忽略), dir_en(忽略), dir_short(忽略), lat(忽略), lon(忽略), lat_offset(使用), lon_offset(使用)
  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i].trim();
    if (!line) continue;

    const columns = line.split(',');
    
    // 確保有足夠的欄位（至少 11 欄：0-10）
    if (columns.length >= 11) {
      const uuid = columns[1]?.trim(); // id 欄位
      const owner = columns[2]?.trim(); // station 欄位
      const latStr = columns[9]?.trim(); // lat_offset 欄位
      const lngStr = columns[10]?.trim(); // lon_offset 欄位

      // 驗證必要欄位
      if (uuid && owner && latStr && lngStr) {
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);

        // 驗證座標是否有效
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          cctvList.push({
            uuid,
            owner,
            lat,
            lng,
          });
        } else {
          console.warn(`Invalid coordinates at line ${i + 1}: lat=${latStr}, lng=${lngStr}`);
        }
      } else {
        console.warn(`Missing required fields at line ${i + 1}`);
      }
    }
  }

  console.log(`Parsed ${cctvList.length} valid CCTV records`);

  // 批量插入資料
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const cctv of cctvList) {
    try {
      // 檢查是否已存在（根據 UUID）
      const existing = await prisma.cctv.findUnique({
        where: {
          uuid: cctv.uuid,
        },
      });

      if (!existing) {
        await prisma.cctv.create({
          data: cctv,
        });
        created++;
      } else {
        // 如果已存在，更新資料
        await prisma.cctv.update({
          where: {
            uuid: cctv.uuid,
          },
          data: {
            owner: cctv.owner,
            lat: cctv.lat,
            lng: cctv.lng,
          },
        });
        updated++;
      }
    } catch (error) {
      console.error(`Error processing CCTV ${cctv.uuid}:`, error);
      skipped++;
    }
  }

  console.log(`Seeded CCTV: ${created} created, ${updated} updated, ${skipped} skipped`);
  console.log(`Total: ${cctvList.length} CCTV cameras processed`);
};

// 如果直接執行此檔案，則執行 seed
if (require.main === module) {
  seedCctv()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

// 導出函數供統一腳本使用
export default seedCctv;
