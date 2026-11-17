import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Carga `.env` en los tests: la integración necesita un Postgres real.
    setupFiles: ['tests/setup.ts'],
    // Un único setup: el guard de `tests/setup.ts` debe correr antes de importar
    // cualquier módulo de aplicación. Los archivos comparten la base de tests y
    // el seed cuenta filas globales, así que se serializan.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
