import { PrismaClient } from '@prisma/client';
import { buildDatabaseUrl } from './databaseUrl';

// Build DATABASE_URL if not provided
buildDatabaseUrl();

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;

