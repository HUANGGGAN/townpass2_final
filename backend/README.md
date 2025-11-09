# TownPass Backend

## Quick Start

在新環境中，只需要兩個步驟：

```bash
npm install
npm start
```

`npm start` 會自動執行：
1. ✅ 檢查環境變數
2. ✅ 生成 Prisma Client
3. ✅ 同步資料庫 schema
4. ✅ 設置 PostGIS 擴展和 geom 欄位
5. ✅ 重置並初始化資料庫（包含所有 seed 資料）
6. ✅ 啟動服務器

## 環境變數

創建 `.env` 檔案，包含以下必要變數：

### 方式一：使用完整的 DATABASE_URL（推薦）
```env
DATABASE_URL="postgresql://user:password@localhost:5432/townpassdb"
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="7d"
GOOGLE_MAPS_API_KEY="your-google-maps-api-key"
```

### 方式二：使用 PostgreSQL 標準環境變數（不需要完整 URL）
```env
PGHOST="localhost"
PGPORT="5432"
PGDATABASE="townpassdb"
PGUSER="postgres"
PGPASSWORD="your-password"
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="7d"
GOOGLE_MAPS_API_KEY="your-google-maps-api-key"
```

**注意**：
- 如果同時提供 `DATABASE_URL` 和個別配置，會優先使用 `DATABASE_URL`
- 使用 PostgreSQL 標準環境變數名稱（`PG*`），與 `psql` 等工具一致

## 開發模式

```bash
npm run dev
```

## 其他指令

- `npm run build` - 編譯 TypeScript
- `npm run init` - 只執行初始化（不啟動服務器）
- `npm run seed` - 只執行 seed（不重置資料庫）
- `npm run reset:seed` - 重置並重新 seed 資料庫
- `npm run prisma:studio` - 開啟 Prisma Studio

## 注意事項

- 首次運行時，`npm start` 會自動初始化所有資料
- 如果 PostGIS 擴展需要 superuser 權限，可能需要手動執行：
  ```sql
  CREATE EXTENSION IF NOT EXISTS postgis;
  ```

