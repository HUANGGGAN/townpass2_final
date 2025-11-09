/**
 * 從環境變數構建 DATABASE_URL
 * 如果 DATABASE_URL 已存在，直接使用
 * 否則從 PostgreSQL 標準環境變數構建：PGUSER, PGPASSWORD, PGDATABASE, PGHOST, PGPORT
 */
export function buildDatabaseUrl(): string {
  // 如果已經有 DATABASE_URL，直接使用
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // 從 PostgreSQL 標準環境變數構建
  const host = process.env.PGHOST || 'localhost';
  const port = process.env.PGPORT || '5432';
  const database = process.env.PGDATABASE || 'townpassdb';
  const user = process.env.PGUSER || 'postgres';
  const password = process.env.PGPASSWORD || '';

  // 構建 PostgreSQL connection string
  // 格式：postgresql://user:password@host:port/database
  const url = `postgresql://${user}${password ? `:${encodeURIComponent(password)}` : ''}@${host}:${port}/${database}`;

  // 設置到 process.env 供 Prisma 使用
  process.env.DATABASE_URL = url;

  return url;
}

