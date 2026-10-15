import { PrismaClient } from "@prisma/client";
import { applyDatabaseUrl } from "@/lib/database-url";

applyDatabaseUrl();

if (!process.env.DATABASE_URL && process.env.NEXT_PHASE === "phase-production-build") {
  process.env.DATABASE_URL = "mysql://127.0.0.1:3306/metaads";
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
