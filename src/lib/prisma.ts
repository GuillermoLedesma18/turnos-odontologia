import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { env } from '@/lib/env';

/**
 * Cliente Prisma (Prisma 7: la conexión se resuelve con un driver adapter).
 *
 * Vive en `src/lib/` porque es infraestructura, no dominio: `src/server/` lo
 * consume desde C-02 en adelante. El singleton evita abrir un pool nuevo en
 * cada recarga del servidor de desarrollo.
 */

/**
 * Cota para establecer la conexión, en milisegundos.
 *
 * `pg` no aplica timeout de conexión por defecto: contra una base colgada el
 * intento queda pendiente indefinidamente y retiene un slot del pool. Con esta
 * cota el intento se corta, el error se propaga y el cliente vuelve al pool.
 *
 * El health check usa el mismo valor como cota total del chequeo, para responder
 * degradado en vez de dejar la request colgada.
 */
export const DATABASE_TIMEOUT_MS = 2_000;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: DATABASE_TIMEOUT_MS,
  });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

// `NODE_ENV` es la única lectura de `process.env` fuera de `src/lib/env.ts`: no es
// configuración de la aplicación, la fijan las herramientas (`next dev`,
// `next build`, Vitest) y no se declara en `.env` (ver design D5). En producción
// no hace falta el singleton: cada instancia del servidor tiene su propio proceso.
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
