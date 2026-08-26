import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";
import { serverConfig } from "@/lib/config/server";

const createPrismaClient = () => {
  const adapter = new PrismaPg({
    connectionString: serverConfig.database.pooledUrl,
  });

  return new PrismaClient({ adapter });
};

type PrismaClientSingleton = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClientSingleton;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (serverConfig.nodeEnv !== "production") {
  globalForPrisma.prisma = prisma;
}
