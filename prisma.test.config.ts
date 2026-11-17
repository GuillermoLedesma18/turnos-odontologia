import 'dotenv/config';

import { defineConfig } from 'prisma/config';

/**
 * Configuración de Prisma para la base EXCLUSIVA de tests.
 *
 * Se separa de `prisma.config.ts` para que `npm run db:test:migrate` no pueda
 * apuntar por accidente a la base de desarrollo: el datasource sale únicamente
 * de `TEST_DATABASE_URL`. El guard de `tests/setup.ts` vuelve a verificar la
 * identidad real de las dos bases antes de cualquier test.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Igual que en `prisma.config.ts`, se usa `process.env` para que el comando
    // falle con un error claro si la variable no está definida.
    url: process.env['TEST_DATABASE_URL'],
  },
});
