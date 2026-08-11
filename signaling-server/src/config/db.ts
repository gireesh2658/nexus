import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const connectDB = async (): Promise<void> => {
  try {
    await prisma.$connect();
    console.log(`[DB] PostgreSQL connected via Prisma`);
  } catch (error) {
    console.error('[DB] PostgreSQL connection error:', error);
    console.error('[DB] Server will continue — Prisma will retry on first query.');
  }
};

export { prisma };
export default connectDB;
