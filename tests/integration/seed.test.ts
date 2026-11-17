import { parseOptions } from '@node-rs/argon2';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seed } from '../../prisma/seed';
import { atUtc, cleanupAll, createAppointment, createPatient, timeAt } from '../helpers/fixtures';
import { testPrisma } from '../helpers/test-db';

const DEV_EMAIL = 'odontologo@example.com';

beforeEach(async () => {
  await cleanupAll();
});

afterEach(async () => {
  await cleanupAll();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('seed de desarrollo', () => {
  it('crea los datos base, usa Argon2id y no filtra la credencial', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const summary = await seed(testPrisma);

    expect(summary).toEqual({
      dentistCreated: true,
      treatmentsCreated: 6,
      availabilityBlocksCreated: 10,
    });

    const dentist = await testPrisma.dentist.findUniqueOrThrow({
      where: { email: DEV_EMAIL },
    });

    expect(dentist.passwordHash).not.toContain('dev-only-password');
    expect(dentist.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);

    expect(parseOptions(dentist.passwordHash)).toMatchObject({
      algorithm: 2,
      version: 1,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      outputLen: 32,
      saltLen: 16,
    });

    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logged).not.toContain('dev-only-password');
    expect(logged).not.toContain(dentist.passwordHash);

    expect(await testPrisma.dentist.count()).toBe(1);
    expect(await testPrisma.treatmentType.count()).toBe(6);
    expect(await testPrisma.availabilityBlock.count()).toBe(10);
    expect(await testPrisma.patient.count()).toBe(0);
    expect(await testPrisma.appointment.count()).toBe(0);
    expect(await testPrisma.notificationLog.count()).toBe(0);

    const treatments = await testPrisma.treatmentType.findMany({
      orderBy: { name: 'asc' },
    });
    expect(
      Object.fromEntries(
        treatments.map((treatment) => [treatment.name, treatment.durationMinutes]),
      ),
    ).toEqual({
      'Consulta / control': 30,
      'Corona / prótesis': 60,
      Endodoncia: 90,
      'Extracción simple': 30,
      'Limpieza (destartraje)': 45,
      'Obturación (resina)': 45,
    });
    expect(treatments.every((treatment) => treatment.active)).toBe(true);

    const blocks = await testPrisma.availabilityBlock.findMany({
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    expect(blocks).toHaveLength(10);

    for (const dayOfWeek of [1, 2, 3, 4, 5]) {
      const dayBlocks = blocks.filter((block) => block.dayOfWeek === dayOfWeek);
      expect(dayBlocks).toHaveLength(2);
      expect(
        dayBlocks
          .map(
            (block) =>
              `${block.startTime.toISOString().slice(11, 16)}-${block.endTime
                .toISOString()
                .slice(11, 16)}`,
          )
          .sort(),
      ).toEqual(['09:00-13:00', '15:00-19:00']);
      expect(dayBlocks.every((block) => block.active)).toBe(true);
    }
  });

  it('es idempotente: no duplica, conserva hash y updatedAt, y no pisa una contraseña cambiada', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await seed(testPrisma);

    const firstDentist = await testPrisma.dentist.findUniqueOrThrow({
      where: { email: DEV_EMAIL },
    });
    const firstCounts = {
      dentists: await testPrisma.dentist.count(),
      treatments: await testPrisma.treatmentType.count(),
      availability: await testPrisma.availabilityBlock.count(),
    };

    const secondSummary = await seed(testPrisma);
    const secondDentist = await testPrisma.dentist.findUniqueOrThrow({
      where: { email: DEV_EMAIL },
    });

    expect(secondSummary).toEqual({
      dentistCreated: false,
      treatmentsCreated: 0,
      availabilityBlocksCreated: 0,
    });
    expect(secondDentist.passwordHash).toBe(firstDentist.passwordHash);
    expect(secondDentist.updatedAt.getTime()).toBe(firstDentist.updatedAt.getTime());
    expect({
      dentists: await testPrisma.dentist.count(),
      treatments: await testPrisma.treatmentType.count(),
      availability: await testPrisma.availabilityBlock.count(),
    }).toEqual(firstCounts);

    await testPrisma.dentist.update({
      where: { id: firstDentist.id },
      data: { passwordHash: 'hash-centinela' },
    });
    const afterSentinelUpdate = await testPrisma.dentist.findUniqueOrThrow({
      where: { email: DEV_EMAIL },
    });

    await seed(testPrisma);

    const afterThirdSeed = await testPrisma.dentist.findUniqueOrThrow({
      where: { email: DEV_EMAIL },
    });
    expect(afterThirdSeed.passwordHash).toBe('hash-centinela');
    expect(afterThirdSeed.updatedAt.getTime()).toBe(afterSentinelUpdate.updatedAt.getTime());
  });

  it('no pisa un catálogo ni una disponibilidad ya modificados', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await seed(testPrisma);

    const treatment = await testPrisma.treatmentType.findFirstOrThrow({
      orderBy: { name: 'asc' },
    });
    const block = await testPrisma.availabilityBlock.findFirstOrThrow({
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    await testPrisma.treatmentType.update({
      where: { id: treatment.id },
      data: { durationMinutes: 99 },
    });
    await testPrisma.availabilityBlock.update({
      where: { id: block.id },
      data: { startTime: timeAt(8, 0) },
    });

    await seed(testPrisma);

    const storedTreatment = await testPrisma.treatmentType.findUniqueOrThrow({
      where: { id: treatment.id },
    });
    const storedBlock = await testPrisma.availabilityBlock.findUniqueOrThrow({
      where: { id: block.id },
    });

    expect(storedTreatment.durationMinutes).toBe(99);
    expect(storedBlock.startTime.toISOString()).toBe('1970-01-01T08:00:00.000Z');
    expect(await testPrisma.treatmentType.count()).toBe(6);
    expect(await testPrisma.availabilityBlock.count()).toBe(10);
  });

  it('no destruye pacientes ni turnos existentes', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await seed(testPrisma);

    const dentist = await testPrisma.dentist.findUniqueOrThrow({
      where: { email: DEV_EMAIL },
    });
    const treatment = await testPrisma.treatmentType.findFirstOrThrow();
    const patient = await createPatient();
    const appointment = await createAppointment({
      dentistId: dentist.id,
      patientId: patient.id,
      treatmentTypeId: treatment.id,
      startsAt: atUtc(9, 0),
      endsAt: atUtc(9, 30),
    });

    await seed(testPrisma);

    expect(await testPrisma.patient.count()).toBe(1);
    expect(await testPrisma.appointment.count()).toBe(1);
    expect(
      await testPrisma.appointment.findUnique({ where: { id: appointment.id } }),
    ).not.toBeNull();
  });

  it('funciona sin variables de mensajería y no llama a servicios externos', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const saved = {
      WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
      WHATSAPP_PHONE_ID: process.env.WHATSAPP_PHONE_ID,
      WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
      WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
      EMAIL_API_KEY: process.env.EMAIL_API_KEY,
    };

    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_ID;
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.EMAIL_API_KEY;

    try {
      const summary = await seed(testPrisma);
      expect(summary.dentistCreated).toBe(true);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }

    expect(await testPrisma.patient.count()).toBe(0);
    expect(await testPrisma.appointment.count()).toBe(0);
  });
});
