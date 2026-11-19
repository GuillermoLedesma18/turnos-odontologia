import { z } from 'zod';

/**
 * Guard de aislamiento de la base de tests.
 *
 * Excepción acotada a la regla dura B7: este archivo lee las URLs de test desde
 * `process.env` antes de que se importe `src/lib/env.ts`. Si importáramos el
 * módulo de entorno primero, quedaría cacheado con la `DATABASE_URL` de
 * desarrollo y el override posterior no tendría efecto. La lectura no queda sin
 * validar: el borde de tests usa Zod y el guard compara además la identidad real
 * de las dos bases antes de permitir cualquier escritura.
 *
 * La función `resolveTestDatabaseUrl` es pura respecto de la base: recibe el
 * `probe` que consulta PostgreSQL. Así los casos negativos se prueban sin una
 * base y el `probe` real se cubre en integración.
 */

const postgresUrl = z
  .string({
    required_error: 'falta la variable',
  })
  .url('debe ser una URL válida')
  .refine((value) => /^postgres(ql)?:\/\//.test(value), {
    message: 'debe ser una URL de PostgreSQL (postgresql://…)',
  });

const testEnvironmentSchema = z.object({
  TEST_DATABASE_URL: postgresUrl,
  // `DATABASE_URL` es opcional: si no hay base de desarrollo, no hay nada que
  // proteger y se usa directamente la base de tests.
  DATABASE_URL: postgresUrl.optional(),
});

export type DatabaseIdentity = {
  database: string;
  serverAddress: string | null;
  serverPort: number | null;
};

export type DatabaseProbeResult = {
  identity: DatabaseIdentity;
  appliedMigrations: number;
};

export type DatabaseProbe = (connectionString: string) => Promise<DatabaseProbeResult>;

export type ResolveTestDatabaseUrlInput = {
  databaseUrl: string | undefined;
  testDatabaseUrl: string | undefined;
  probe: DatabaseProbe;
};

type NormalizedDatabaseUrl = {
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
};

function normalizeDatabaseUrl(raw: string): NormalizedDatabaseUrl {
  const parsed = new URL(raw);
  const params = [...parsed.searchParams.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return {
    // `postgres://` y `postgresql://` son el mismo protocolo para PostgreSQL,
    // pero `URL` los expone distinto.
    protocol: parsed.protocol === 'postgres:' ? 'postgresql:' : parsed.protocol,
    username: parsed.username,
    password: parsed.password,
    hostname: parsed.hostname.toLowerCase(),
    port: parsed.port || '5432',
    pathname: parsed.pathname.replace(/\/+$/, '') || '/',
    search: new URLSearchParams(params).toString(),
  };
}

function isSameNormalizedUrl(left: string, right: string): boolean {
  const a = normalizeDatabaseUrl(left);
  const b = normalizeDatabaseUrl(right);

  return (
    a.protocol === b.protocol &&
    a.username === b.username &&
    a.password === b.password &&
    a.hostname === b.hostname &&
    a.port === b.port &&
    a.pathname === b.pathname &&
    a.search === b.search
  );
}

function isSameIdentity(left: DatabaseIdentity, right: DatabaseIdentity): boolean {
  return (
    left.database === right.database &&
    left.serverAddress === right.serverAddress &&
    left.serverPort === right.serverPort
  );
}

async function probeOrAbort(
  probe: DatabaseProbe,
  connectionString: string,
  variable: string,
): Promise<DatabaseProbeResult> {
  try {
    return await probe(connectionString);
  } catch {
    // No se propaga el error original: puede contener la URL completa con
    // credenciales. El mensaje nombra la variable y el motivo, no el valor.
    throw new Error(
      `No se pudo verificar ${variable}; los tests se abortan. ` +
        'Revisá que la base esté levantada, sea alcanzable y tenga migraciones aplicadas.',
    );
  }
}

function assertMigrated(result: DatabaseProbeResult): void {
  if (result.appliedMigrations < 1) {
    throw new Error(
      'La base de tests no tiene migraciones aplicadas. Ejecutá npm run db:test:migrate.',
    );
  }
}

/**
 * Devuelve la URL que debe usar la suite o lanza antes de cualquier escritura.
 *
 * Orden:
 * 1. `TEST_DATABASE_URL` es obligatoria y válida.
 * 2. Si falta `DATABASE_URL`, no hay base de desarrollo que proteger; se usa la
 *    base de tests y se verifica que esté migrada.
 * 3. Si las URLs normalizadas son iguales, se aborta sin abrir conexiones.
 * 4. Se comparan las identidades reales (`current_database()`, servidor y
 *    puerto). Si coinciden, es la misma base física y se aborta.
 * 5. La base de tests debe tener al menos una migración aplicada.
 */
export async function resolveTestDatabaseUrl({
  databaseUrl,
  testDatabaseUrl,
  probe,
}: ResolveTestDatabaseUrlInput): Promise<string> {
  const parsed = testEnvironmentSchema.safeParse({
    DATABASE_URL: databaseUrl,
    TEST_DATABASE_URL: testDatabaseUrl,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const variable = issue?.path.join('.') || 'entorno de tests';

    throw new Error(
      `Configuración de tests inválida: ${variable}: ${issue?.message ?? 'valor inválido'}. ` +
        'Revisá .env y el README.',
    );
  }

  const devUrl = parsed.data.DATABASE_URL;
  const testUrl = parsed.data.TEST_DATABASE_URL;

  if (!devUrl) {
    const testResult = await probeOrAbort(probe, testUrl, 'TEST_DATABASE_URL');
    assertMigrated(testResult);
    return testUrl;
  }

  if (isSameNormalizedUrl(devUrl, testUrl)) {
    throw new Error(
      'TEST_DATABASE_URL apunta a la misma base que DATABASE_URL; los tests no se ejecutan ' +
        'sobre la base de desarrollo.',
    );
  }

  const [devResult, testResult] = await Promise.all([
    probeOrAbort(probe, devUrl, 'DATABASE_URL'),
    probeOrAbort(probe, testUrl, 'TEST_DATABASE_URL'),
  ]);

  const devNormalized = normalizeDatabaseUrl(devUrl);
  const testNormalized = normalizeDatabaseUrl(testUrl);
  const distinctEndpoint =
    devNormalized.hostname !== testNormalized.hostname ||
    devNormalized.port !== testNormalized.port;

  if (isSameIdentity(devResult.identity, testResult.identity) && !distinctEndpoint) {
    throw new Error(
      'TEST_DATABASE_URL y DATABASE_URL resuelven a la misma base física; los tests se abortan.',
    );
  }

  assertMigrated(testResult);
  return testUrl;
}
