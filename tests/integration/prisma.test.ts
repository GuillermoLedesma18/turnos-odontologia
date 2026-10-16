import { afterAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma';

/**
 * Smoke de arranque de Prisma contra un Postgres REAL (regla dura D14: sin
 * mocks de base). Requiere `npm run db:up` — o cualquier Postgres alcanzable
 * vía `DATABASE_URL` — antes de correr la suite.
 */
describe('arranque de Prisma', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('se conecta al Postgres real y ejecuta una consulta', async () => {
    const rows = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 AS result`;

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].result)).toBe(1);
  });

  it('reporta la versión del servidor, así que la conexión es real', async () => {
    const rows = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version() AS version`;

    expect(rows[0].version).toMatch(/PostgreSQL/i);
  });
});
