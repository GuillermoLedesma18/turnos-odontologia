import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { PrismaClient } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';

import { resolveTestDatabaseUrl } from './test-database';
import type { DatabaseIdentity, DatabaseProbeResult } from './test-database';

const DEV_URL = 'postgresql://turnos:turnos@localhost:5432/turnos';
const TEST_URL = 'postgresql://turnos:turnos@localhost:5432/turnos_test';

const DEV_IDENTITY: DatabaseIdentity = {
  database: 'turnos',
  serverAddress: '127.0.0.1',
  serverPort: 5432,
};

const TEST_IDENTITY: DatabaseIdentity = {
  database: 'turnos_test',
  serverAddress: '127.0.0.1',
  serverPort: 5432,
};

function migrated(identity: DatabaseIdentity): DatabaseProbeResult {
  return { identity, appliedMigrations: 1 };
}

function createProbe(result: DatabaseProbeResult) {
  return vi.fn(async (): Promise<DatabaseProbeResult> => result);
}

describe('resolveTestDatabaseUrl', () => {
  it('aborta si falta TEST_DATABASE_URL sin abrir conexiones', async () => {
    const probe = createProbe(migrated(TEST_IDENTITY));

    await expect(
      resolveTestDatabaseUrl({
        databaseUrl: DEV_URL,
        testDatabaseUrl: undefined,
        probe,
      }),
    ).rejects.toThrowError(/TEST_DATABASE_URL/);

    expect(probe).not.toHaveBeenCalled();
  });

  it('aborta si TEST_DATABASE_URL no es una URL de PostgreSQL válida', async () => {
    const probe = createProbe(migrated(TEST_IDENTITY));

    await expect(
      resolveTestDatabaseUrl({
        databaseUrl: DEV_URL,
        testDatabaseUrl: 'mysql://localhost:3306/turnos_test',
        probe,
      }),
    ).rejects.toThrowError(/TEST_DATABASE_URL/);

    expect(probe).not.toHaveBeenCalled();
  });

  it('aborta si las URLs normalizadas son iguales, sin probar identidad', async () => {
    const probe = createProbe(migrated(TEST_IDENTITY));

    await expect(
      resolveTestDatabaseUrl({
        // `postgres://` y `postgresql://` son el mismo protocolo y la barra
        // final no cambia la base.
        databaseUrl: 'postgresql://turnos:turnos@LOCALHOST:5432/turnos',
        testDatabaseUrl: 'postgres://turnos:turnos@localhost:5432/turnos/',
        probe,
      }),
    ).rejects.toThrowError(/misma base/);

    expect(probe).not.toHaveBeenCalled();
  });

  it('aborta si dos URLs distintas resuelven a la misma base física', async () => {
    const probe = vi.fn(async (connectionString: string): Promise<DatabaseProbeResult> => {
      // Simula `prisma dev`: ignora el pathname y siempre devuelve template1.
      return connectionString.includes('turnos_test')
        ? migrated({ ...DEV_IDENTITY, database: 'template1' })
        : migrated({ ...DEV_IDENTITY, database: 'template1' });
    });

    await expect(
      resolveTestDatabaseUrl({
        databaseUrl: DEV_URL,
        testDatabaseUrl: TEST_URL,
        probe,
      }),
    ).rejects.toThrowError(/misma base física/);

    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('aborta si la base de tests no tiene migraciones aplicadas', async () => {
    const probe = vi.fn(async (connectionString: string): Promise<DatabaseProbeResult> => {
      return connectionString === DEV_URL
        ? migrated(DEV_IDENTITY)
        : { identity: TEST_IDENTITY, appliedMigrations: 0 };
    });

    await expect(
      resolveTestDatabaseUrl({
        databaseUrl: DEV_URL,
        testDatabaseUrl: TEST_URL,
        probe,
      }),
    ).rejects.toThrowError(/db:test:migrate/);
  });

  it('acepta una base distinta y migrada', async () => {
    const probe = vi.fn(async (connectionString: string): Promise<DatabaseProbeResult> => {
      return connectionString === DEV_URL ? migrated(DEV_IDENTITY) : migrated(TEST_IDENTITY);
    });

    await expect(
      resolveTestDatabaseUrl({
        databaseUrl: DEV_URL,
        testDatabaseUrl: TEST_URL,
        probe,
      }),
    ).resolves.toBe(TEST_URL);
  });

  it('si falta DATABASE_URL usa la base de tests y verifica que esté migrada', async () => {
    const probe = createProbe(migrated(TEST_IDENTITY));

    await expect(
      resolveTestDatabaseUrl({
        databaseUrl: undefined,
        testDatabaseUrl: TEST_URL,
        probe,
      }),
    ).resolves.toBe(TEST_URL);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith(TEST_URL);
  });

  it('aborta sin filtrar la URL si el probe falla', async () => {
    const secret = 'clave-que-no-debe-filtrarse';
    const probe = vi.fn(async (): Promise<DatabaseProbeResult> => {
      throw new Error(`falló postgresql://turnos:${secret}@localhost:5432/turnos_test`);
    });

    let message = '';
    try {
      await resolveTestDatabaseUrl({
        databaseUrl: undefined,
        testDatabaseUrl: `postgresql://turnos:${secret}@localhost:5432/turnos_test`,
        probe,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('TEST_DATABASE_URL');
    expect(message).not.toContain(secret);
  });
});

/**
 * Verificación de integración del guard y del orden de carga.
 *
 * El import estático de `src/lib/prisma` es deliberado: Vitest ejecuta
 * `tests/setup.ts` antes de este módulo, así que el singleton debe haber leído
 * ya la `DATABASE_URL` reemplazada por la base de tests. Si el orden se rompe,
 * este test consulta la base de desarrollo y falla.
 */

const CONNECTION_TIMEOUT_MS = 2_000;

async function probeDatabase(connectionString: string): Promise<DatabaseProbeResult> {
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
}

function testDatabaseName(): string {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL no está definida');
  }

  return decodeURIComponent(new URL(testUrl).pathname.replace(/^\//, ''));
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('aislamiento real de la base de tests', () => {
  it('la base de tests existe, está migrada y reporta su propio nombre', async () => {
    const testUrl = process.env.TEST_DATABASE_URL;
    expect(testUrl).toBeDefined();

    const result = await probeDatabase(testUrl as string);

    expect(result.appliedMigrations).toBeGreaterThanOrEqual(1);
    expect(result.identity.database).toBe(testDatabaseName());
  });

  it('el singleton de la app reporta la base de tests, no la de desarrollo', async () => {
    const rows = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;

    expect(rows[0]?.database).toBe(testDatabaseName());
  });
});
