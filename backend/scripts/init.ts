import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import resetAndSeed from '../prisma/seeds/resetAndSeed';
import { buildDatabaseUrl } from '../src/config/databaseUrl';

dotenv.config();

// Build DATABASE_URL from individual components if not provided
buildDatabaseUrl();

const prisma = new PrismaClient();

async function checkEnvVars() {
  // 檢查是否有 DATABASE_URL 或足夠的資料庫配置
  const hasDatabaseUrl = !!process.env.DATABASE_URL;
  const hasDbComponents = process.env.PGHOST || process.env.PGDATABASE;
  
  if (!hasDatabaseUrl && !hasDbComponents) {
    console.error('❌ Missing database configuration');
    console.error('Please provide either:');
    console.error('  - DATABASE_URL (full connection string), or');
    console.error('  - PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD (PostgreSQL standard variables)');
    process.exit(1);
  }
  
  console.log('✅ Environment variables checked');
  if (!hasDatabaseUrl) {
    console.log(`   Using database: ${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE || 'townpassdb'}`);
  }
}

async function setupDatabase() {
  console.log('\n📦 Setting up database...');
  
  try {
    // 確保 DATABASE_URL 已設置（供 Prisma 命令使用）
    buildDatabaseUrl();
    
    console.log('1. Generating Prisma Client...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('✅ Prisma Client generated');
    
    console.log('2. Pushing database schema...');
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
    console.log('✅ Database schema synced');
    
    console.log('3. Adding PostGIS geom column if needed...');
    try {
      await prisma.$executeRaw`
        ALTER TABLE danger_points ADD COLUMN IF NOT EXISTS geom geometry(Point,3826)
      `;
      console.log('✅ PostGIS geom column ready');
    } catch (error: any) {
      if (error.message?.includes('does not exist')) {
        console.log('⚠️  PostGIS extension not found, attempting to create...');
        try {
          await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS postgis`;
          await prisma.$executeRaw`
            ALTER TABLE danger_points ADD COLUMN IF NOT EXISTS geom geometry(Point,3826)
          `;
          console.log('✅ PostGIS extension and geom column created');
        } catch (e: any) {
          console.log('⚠️  PostGIS setup skipped (may need superuser privileges)');
          console.log('   You may need to manually run: CREATE EXTENSION IF NOT EXISTS postgis;');
        }
      } else {
        throw error;
      }
    }
    
    console.log('4. Updating existing points with geom data...');
    try {
      await prisma.$executeRaw`
        UPDATE danger_points 
        SET geom = ST_Transform(ST_SetSRID(ST_MakePoint(lng, lat), 4326), 3826) 
        WHERE geom IS NULL
      `;
      console.log('✅ Existing points updated with geom data');
    } catch (error: any) {
      console.log('⚠️  Could not update geom data (PostGIS may not be available)');
    }
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    throw error;
  }
}

async function initializeData() {
  console.log('\n🌱 Initializing database data...');
  
  try {
    await resetAndSeed();
    console.log('✅ Database initialized with seed data');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

async function init() {
  console.log('🚀 Starting initialization process...\n');
  
  try {
    await checkEnvVars();
    await setupDatabase();
    await initializeData();
    
    console.log('\n✅ Initialization completed successfully!');
    console.log('🎉 Ready to start the server');
  } catch (error) {
    console.error('\n❌ Initialization failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  init();
}

export default init;

