import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@/generated/prisma/client';

/**
 * Cliente Prisma exclusivo de los tests.
 *
 * No usa el singleton de `src/lib/prisma.ts`: los helpers y fixtures tienen su
 * propio cliente contra `TEST_DATABASE_URL`. El setup ya verificó que esta base
 * sea distinta de la de desarrollo y que esté migrada antes de importar este
 * módulo.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL no está definida. El guard de tests debería haber abortado antes.',
  );
}

export const testPrisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: testDatabaseUrl,
    connectionTimeoutMillis: 2_000,
  }),
});
