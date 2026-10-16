import 'dotenv/config';

import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Se lee de `.env` (cargado arriba). Se usa `process.env` en lugar del helper
    // `env()` para que `prisma generate` funcione en un entorno sin `.env`.
    url: process.env['DATABASE_URL'],
  },
});
