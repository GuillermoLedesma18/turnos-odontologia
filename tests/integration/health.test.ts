import { createServer, type Server, type Socket } from 'node:net';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/health/route';
import { prisma } from '@/lib/prisma';

/**
 * Tests de integración del health check contra un Postgres real (regla dura
 * D14: sin mocks de base). El escenario "base inalcanzable" usa una URL de
 * formato válido apuntando a un puerto sin servicio: es una conexión que falla
 * de verdad, no un mock.
 */

const UNREACHABLE_DATABASE_URL = 'postgresql://turnos:turnos@127.0.0.1:59999/turnos';

/**
 * Endpoint TCP que simula dos modos de fallo de una base, sin mockear el motor:
 * - `hang`: acepta la conexión y nunca responde (base "lenta"/colgada).
 * - `abort`: acepta y corta la conexión de inmediato (servidor presente que la
 *   rechaza, el modo de fallo que en producción produce una credencial inválida).
 */
type FailureMode = 'hang' | 'abort';

async function startFakeDatabaseServer(
  mode: FailureMode,
): Promise<{ port: number; stop: () => Promise<void> }> {
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    if (mode === 'abort') {
      socket.destroy();
      return;
    }

    sockets.add(socket);
    socket.on('error', () => undefined);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('no se pudo obtener el puerto del servidor de prueba');
  }

  return {
    port: address.port,
    stop: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

async function countStoredRows(): Promise<{ tables: number; rows: number }> {
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`;

  let rows = 0;
  for (const table of tables) {
    const counted = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*)::bigint AS count FROM "${table.table_name}"`,
    );
    rows += Number(counted[0].count);
  }

  return { tables: tables.length, rows };
}

describe('GET /api/health', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('responde 200 con estado saludable cuando la base está alcanzable', async () => {
    // Se invoca sin cookie de sesión ni header de autorización: el endpoint es
    // público por diseño y no debe responder 401 ni 403.
    const response = await GET();
    const body = (await response.json()) as { status: string; database: string };

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.database).toBe('up');
  });

  it('no filtra la cadena de conexión, credenciales ni trazas', async () => {
    const response = await GET();
    const text = await response.text();
    const databaseUrl = process.env.DATABASE_URL ?? '';
    const parsed = new URL(databaseUrl);

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(text).not.toContain(databaseUrl);
    if (parsed.password.length > 0) {
      expect(text).not.toContain(parsed.password);
    }
    if (parsed.username.length > 0) {
      expect(text).not.toContain(parsed.username);
    }
    expect(text).not.toMatch(/ECONNREFUSED|stack|at Object\./);
  });

  it('responde 503 con estado degradado cuando la base no responde', async () => {
    vi.resetModules();
    vi.stubEnv('DATABASE_URL', UNREACHABLE_DATABASE_URL);
    // `src/lib/prisma.ts` cachea el cliente en `globalThis` para sobrevivir al
    // hot-reload de Next. Sin limpiar esa caché, el módulo re-importado
    // reutilizaría el cliente real y el test no probaría nada.
    Reflect.deleteProperty(globalThis, 'prisma');

    const { GET: degradedGet } = await import('@/app/api/health/route');
    const { prisma: degradedPrisma } = await import('@/lib/prisma');

    try {
      const response = await degradedGet();
      const text = await response.text();
      const body = JSON.parse(text) as { status: string; database: string };

      expect(response.status).toBe(503);
      expect(body.status).toBe('degraded');
      expect(body.database).toBe('down');
      expect(text).not.toMatch(/ECONNREFUSED|stack|at Object\./);
    } finally {
      await degradedPrisma.$disconnect();
    }
  });

  it('responde 503 cuando la base rechaza la conexión', async () => {
    // Distinto del puerto muerto: acá el servidor SÍ está y acepta el TCP, pero
    // corta la conexión. Es el modo de fallo que en producción produce una
    // credencial inválida o una base inexistente, y la conexión falla de verdad.
    const aborting = await startFakeDatabaseServer('abort');

    vi.resetModules();
    vi.stubEnv('DATABASE_URL', `postgresql://turnos:turnos@127.0.0.1:${aborting.port}/turnos`);
    Reflect.deleteProperty(globalThis, 'prisma');

    const { GET: rejectedGet } = await import('@/app/api/health/route');
    const { prisma: rejectedPrisma } = await import('@/lib/prisma');

    try {
      // La conexión está viva y falla por rechazo del servidor, no por timeout.
      await expect(rejectedPrisma.$queryRaw`SELECT 1`).rejects.toThrow();

      const response = await rejectedGet();
      const text = await response.text();
      const body = JSON.parse(text) as { status: string; database: string };

      expect(response.status).toBe(503);
      expect(body.status).toBe('degraded');
      expect(body.database).toBe('down');
      expect(text).not.toMatch(/ECONNREFUSED|ECONNRESET|stack|at Object\./);
    } finally {
      await rejectedPrisma.$disconnect().catch(() => undefined);
      await aborting.stop();
    }
  });

  it('una base que cuelga no cuelga el endpoint ni deja el intento pendiente', async () => {
    const unresponsive = await startFakeDatabaseServer('hang');

    vi.resetModules();
    vi.stubEnv('DATABASE_URL', `postgresql://turnos:turnos@127.0.0.1:${unresponsive.port}/turnos`);
    Reflect.deleteProperty(globalThis, 'prisma');

    const { GET: hangingGet } = await import('@/app/api/health/route');
    const { prisma: hangingPrisma } = await import('@/lib/prisma');

    try {
      // 1) El intento de conexión termina solo: si el pool no tuviera cota de
      // conexión, esta promesa quedaría pendiente para siempre y retendría un
      // slot. Que rechace es lo que prueba que la cota está activa.
      await expect(hangingPrisma.$queryRaw`SELECT 1`).rejects.toThrow();

      // 2) Y el endpoint responde igual, sin quedar pendiente.
      const startedAt = Date.now();
      const response = await hangingGet();
      const elapsed = Date.now() - startedAt;
      const body = (await response.json()) as { status: string; database: string };

      expect(response.status).toBe(503);
      expect(body.status).toBe('degraded');
      expect(body.database).toBe('down');
      expect(elapsed).toBeLessThan(10_000);
    } finally {
      // El endpoint que cuelga se cierra ANTES de desconectar el cliente: si no,
      // el pool queda esperando una conexión pendiente que nunca va a responder.
      await unresponsive.stop();
      await hangingPrisma.$disconnect().catch(() => undefined);
    }
  });

  it('no produce efectos secundarios al invocarlo repetidamente', async () => {
    const before = await countStoredRows();

    for (let i = 0; i < 3; i += 1) {
      const response = await GET();
      expect(response.status).toBe(200);
    }

    const after = await countStoredRows();

    expect(after).toEqual(before);
  });
});
