import { NextResponse } from 'next/server';

import { DATABASE_TIMEOUT_MS, prisma } from '@/lib/prisma';

/**
 * `GET /api/health` — contrato operativo del deploy.
 *
 * Público por diseño (lo consume el host, el CI y los tests de humo) y sin
 * autenticación. Distingue "proceso vivo" de "proceso vivo con base
 * alcanzable": `200` si la base responde, `503` si no.
 *
 * `force-dynamic` es obligatorio: sin él, Next 14 prerenderiza el route handler
 * en `next build` y el endpoint consultaría la base durante el build en vez de
 * reflejar el estado real en runtime.
 */

export const dynamic = 'force-dynamic';

async function isDatabaseReachable(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Cota total del chequeo. El adapter ya acota el intento de conexión con el
  // mismo valor (`DATABASE_TIMEOUT_MS`); esto cubre además el caso de que la
  // conexión se establezca pero la consulta no vuelva.
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('la comprobación de base excedió el tiempo límite')),
      DATABASE_TIMEOUT_MS,
    );
  });

  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, deadline]);
    return true;
  } catch {
    // La base no responde (caída, credenciales inválidas o demasiado lenta).
    // No se propaga la excepción: el estado degradado es la respuesta.
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(): Promise<NextResponse> {
  const databaseReachable = await isDatabaseReachable();

  return NextResponse.json(
    {
      status: databaseReachable ? 'ok' : 'degraded',
      database: databaseReachable ? 'up' : 'down',
    },
    { status: databaseReachable ? 200 : 503 },
  );
}
