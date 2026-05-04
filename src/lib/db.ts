import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as {
  prisma?: PrismaClient;
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const adapter = new PrismaPg({ connectionString });

export const db =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
