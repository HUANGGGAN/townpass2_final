import { PrismaClient, SafePlaceType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * 解析 CSV 行，處理引號內的逗號
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // 添加最後一個欄位
  result.push(current.trim());
  
  return result;
}

/**
 * 將 CSV 中的類型映射到 SafePlaceType
 */
function mapTypeToSafePlaceType(type: string): SafePlaceType {
  // 處理警察機構
  if (type.includes('警察') || type.includes('警局') || type.includes('派出所') || type.includes('分局')) {
    return 'police';
  }
  // 處理消防機構
  if (type.includes('消防')) {
    return 'fire';
  }
  // 處理便利商店（映射到 shelter，因為便利商店也是安全地點）
  if (type.includes('便利商店') || type.includes('全家') || type.includes('7-11') || type.includes('7-ELEVEN') || type.includes('萊爾富') || type.includes('OK')) {
    return 'shelter';
  }
  // 處理避難所
  if (type.includes('避難')) {
    return 'shelter';
  }
  // 預設為警察機構
  return 'police';
}

/**
 * 解析座標字串（格式："lat,lng"）
 */
function parseCoordinates(coordStr: string): { lat: number; lng: number } | null {
  // 移除引號和空白
  const cleaned = coordStr.replace(/^["']|["']$/g, '').trim();
  const parts = cleaned.split(',');
  
  if (parts.length !== 2) {
    return null;
  }
  
  const lat = parseFloat(parts[0].trim());
  const lng = parseFloat(parts[1].trim());
  
  if (isNaN(lat) || isNaN(lng)) {
    return null;
  }
  
  // 驗證座標範圍
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  
  return { lat, lng };
}

/**
 * 安全地點種子資料
 * 從 CSV 檔案讀取安全地點資料
 */
const seedSafePlaces = async () => {
  console.log('Seeding safe places from CSV...');

  const csvPath = path.join(__dirname, '../../assets/place.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    console.log('⚠️  Skipping safe place seed (CSV file not found)');
    return;
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');

  // 跳過標題行
  const dataLines = lines.slice(1);
  console.log(`Found ${dataLines.length} data lines in CSV (excluding header)`);

  const safePlaces: Array<{
    name: string;
    lat: number;
    lng: number;
    type: SafePlaceType;
    address?: string;
    phone?: string;
    timeStart?: Date | null;
    timeEnd?: Date | null;
    is24h: boolean;
    description?: string;
  }> = [];

  // 解析 CSV 資料
  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i].trim();
    if (!line) continue;

    const columns = parseCSVLine(line);
    
    // CSV 格式：name,type,座標(經緯度),營業時間
    if (columns.length >= 3) {
      const name = columns[0]?.trim();
      const typeStr = columns[1]?.trim();
      const coordStr = columns[2]?.trim();
      const businessHours = columns[3]?.trim() || '';

      if (!name || !typeStr || !coordStr) {
        console.warn(`Missing required fields at line ${i + 2}: name=${name}, type=${typeStr}, coord=${coordStr}`);
        continue;
      }

      const coords = parseCoordinates(coordStr);
      if (!coords) {
        console.warn(`Invalid coordinates at line ${i + 2}: ${coordStr}`);
        continue;
      }

      const type = mapTypeToSafePlaceType(typeStr);
      
      // 警察機構、消防機構和便利商店預設為 24 小時服務
      const is24h = type === 'police' || type === 'fire' || type === 'shelter';
      
      // 根據類型設定描述
      let description = '';
      if (type === 'police') {
        description = '警察機構';
      } else if (type === 'fire') {
        description = '消防機構';
      } else if (typeStr.includes('便利商店')) {
        description = typeStr; // 保留原始類型資訊，例如 "便利商店(全家)"
      } else {
        description = '避難所';
      }
      
      safePlaces.push({
        name,
        lat: coords.lat,
        lng: coords.lng,
        type,
        is24h,
        timeStart: null,
        timeEnd: null,
        description,
      });
    } else {
      console.warn(`Invalid CSV format at line ${i + 2}: expected at least 3 columns, got ${columns.length}`);
    }
  }

  console.log(`Parsed ${safePlaces.length} valid safe place records`);

  // 批量插入資料
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const place of safePlaces) {
    try {
      // 檢查是否已存在（根據 name）
      const existing = await prisma.safePlace.findFirst({
        where: {
          name: place.name,
        },
      });

      if (!existing) {
        await prisma.safePlace.create({
          data: place,
        });
        created++;
      } else {
        // 如果已存在，更新資料
        await prisma.safePlace.update({
          where: {
            id: existing.id,
          },
          data: place,
        });
        updated++;
      }
    } catch (error) {
      console.error(`Error processing place "${place.name}":`, error);
      skipped++;
    }
  }

  console.log(`✅ Seeded safe places: ${created} created, ${updated} updated, ${skipped} skipped`);
};

// 如果直接執行此檔案，則執行 seed
if (require.main === module) {
  seedSafePlaces()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

// 導出函數供統一腳本使用
export default seedSafePlaces;
