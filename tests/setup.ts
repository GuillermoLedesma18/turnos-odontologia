// Carga `.env` antes de cualquier test. Es la misma decisión que en
// `prisma.config.ts`: la configuración se carga explícitamente, no por magia
// del framework.
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@/generated/prisma/client';

import { resolveTestDatabaseUrl, type DatabaseProbe } from './test-database';

/**
 * Guard de aislamiento, en el top level del único `setupFiles`.
 *
 * IMPORTANTE: este archivo NO importa `src/lib/env.ts`, `src/lib/prisma.ts` ni
 * ningún módulo de aplicación antes del override de `DATABASE_URL`. Vitest
 * ejecuta los setup files antes de importar el archivo de test; por eso, cuando
 * el test importa el singleton, ya apunta a la base de tests. Si se agregara
 * otro setup file en el futuro, debe correr después de este guard y no puede
 * importar módulos de aplicación antes del override.
 */

const CONNECTION_TIMEOUT_MS = 2_000;

const probe: DatabaseProbe = async (connectionString) => {
  const client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    }),
  });

  try {
    const identityRows = await client.$queryRaw<
      Array<{ database: string; server_address: string | null; server_port: number | null }>
    >`
      SELECT current_database() AS database,
             inet_server_addr()::text AS server_address,
             inet_server_port() AS server_port
    `;

    const identity = identityRows[0];
    if (!identity) {
      throw new Error('la base no devolvió su identidad');
    }

    const migrationTableRows = await client.$queryRaw<Array<{ table_name: string | null }>>`
      SELECT to_regclass('public._prisma_migrations')::text AS table_name
    `;

    let appliedMigrations = 0;
    if (migrationTableRows[0]?.table_name) {
      const countRows = await client.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count
        FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      `;
      appliedMigrations = Number(countRows[0]?.count ?? 0);
    }

    return {
      identity: {
        database: identity.database,
        serverAddress: identity.server_address,
        serverPort: identity.server_port,
      },
      appliedMigrations,
    };
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
};

const effectiveDatabaseUrl = await resolveTestDatabaseUrl({
  databaseUrl: process.env.DATABASE_URL,
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  probe,
});

// A partir de acá, cualquier import accidental de `src/lib/env.ts` o
// `src/lib/prisma.ts` escribe en la base de tests. El aislamiento deja de ser
// una convención y pasa a ser una garantía.
process.env.DATABASE_URL = effectiveDatabaseUrl;
