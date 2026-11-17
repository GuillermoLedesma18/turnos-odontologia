import 'dotenv/config';

import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';
import type { Algorithm, Options, Version } from '@node-rs/argon2';

import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Seed de desarrollo.
 *
 * Datos ficticios y idempotentes: un odontólogo, seis tratamientos y diez
 * bloques de disponibilidad. No crea pacientes, turnos ni notificaciones y no
 * llama a servicios externos.
 *
 * La credencial es pública (`dev-only-password`) y solo sirve para desarrollo.
 * El hash se calcula únicamente en la rama de creación: si el odontólogo ya
 * existe, no se regenera la sal ni se actualiza `passwordHash`/`updatedAt`.
 */

const DEV_DENTIST_EMAIL = 'odontologo@example.com';
const DEV_DENTIST_FULL_NAME = 'Odontólogo de desarrollo';
const DEV_PASSWORD = 'dev-only-password';

// `Algorithm` y `Version` son `const enum`; con `isolatedModules` no se pueden
// importar como valores. Se usan constantes locales tipadas y el test verifica
// el PHC resultante con `parseOptions()`.
const ARGON2ID = 2 as Algorithm;
const VERSION_0X13 = 1 as Version;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  version: VERSION_0X13,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} satisfies Options;

const TREATMENTS = [
  { name: 'Consulta / control', durationMinutes: 30 },
  { name: 'Limpieza (destartraje)', durationMinutes: 45 },
  { name: 'Obturación (resina)', durationMinutes: 45 },
  { name: 'Endodoncia', durationMinutes: 90 },
  { name: 'Extracción simple', durationMinutes: 30 },
  { name: 'Corona / prótesis', durationMinutes: 60 },
] as const;

export type SeedSummary = {
  dentistCreated: boolean;
  treatmentsCreated: number;
  availabilityBlocksCreated: number;
};

function timeAt(hour: number, minute: number): Date {
  return new Date(Date.UTC(1970, 0, 1, hour, minute));
}

export async function seed(prisma: PrismaClient): Promise<SeedSummary> {
  let dentistCreated = false;

  let dentist = await prisma.dentist.findUnique({
    where: { email: DEV_DENTIST_EMAIL },
  });

  if (!dentist) {
    const passwordHash = await hash(DEV_PASSWORD, {
      ...ARGON2_OPTIONS,
      salt: randomBytes(16),
    });

    dentist = await prisma.dentist.create({
      data: {
        email: DEV_DENTIST_EMAIL,
        passwordHash,
        fullName: DEV_DENTIST_FULL_NAME,
      },
    });
    dentistCreated = true;
  }

  let treatmentsCreated = 0;
  const treatmentCount = await prisma.treatmentType.count();

  if (treatmentCount === 0) {
    const created = await prisma.treatmentType.createMany({
      data: TREATMENTS.map((treatment) => ({
        ...treatment,
        active: true,
      })),
    });
    treatmentsCreated = created.count;
  }

  let availabilityBlocksCreated = 0;
  const availabilityCount = await prisma.availabilityBlock.count({
    where: { dentistId: dentist.id },
  });

  if (availabilityCount === 0) {
    const blocks = [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
      {
        dentistId: dentist.id,
        dayOfWeek,
        startTime: timeAt(9, 0),
        endTime: timeAt(13, 0),
        active: true,
      },
      {
        dentistId: dentist.id,
        dayOfWeek,
        startTime: timeAt(15, 0),
        endTime: timeAt(19, 0),
        active: true,
      },
    ]);

    const created = await prisma.availabilityBlock.createMany({ data: blocks });
    availabilityBlocksCreated = created.count;
  }

  console.log(
    `Seed de desarrollo: odontólogo ${dentistCreated ? 'creado' : 'existente'}, ` +
      `${treatmentsCreated} tratamientos creados, ` +
      `${availabilityBlocksCreated} bloques de disponibilidad creados.`,
  );

  return {
    dentistCreated,
    treatmentsCreated,
    availabilityBlocksCreated,
  };
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  if (entrypoint === undefined) {
    return false;
  }

  // `tsx` ejecuta el seed como CommonJS (`package.json` no declara `"type":
  // "module"`), donde `__filename` existe. Vitest lo importa como ESM, donde
  // `__filename` no existe y se usa `import.meta.url`. Así el guard funciona en
  // los dos contextos sin top-level await (no soportado en la salida CJS).
  if (typeof __filename === 'string') {
    return resolve(entrypoint) === resolve(__filename);
  }

  return pathToFileURL(resolve(entrypoint)).href === import.meta.url;
}

async function runAsScript(): Promise<void> {
  const { env } = await import('../src/lib/env');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      connectionTimeoutMillis: 2_000,
    }),
  });

  try {
    await seed(prisma);
  } catch {
    // El error de Prisma puede incluir la cadena de conexión. El script de
    // desarrollo informa el motivo sin filtrar credenciales.
    console.error('Seed falló. Revisá que la base esté migrada y que DATABASE_URL sea correcta.');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

if (isMainModule()) {
  runAsScript().catch(() => {
    console.error('Seed falló antes de conectarse a la base. Revisá DATABASE_URL.');
    process.exitCode = 1;
  });
}
