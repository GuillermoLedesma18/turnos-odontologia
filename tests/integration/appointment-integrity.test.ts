import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppointmentStatus } from '@/generated/prisma/client';
import type { Dentist, Patient, TreatmentType } from '@/generated/prisma/client';

import {
  atUtc,
  cleanupAll,
  createAppointment,
  createDentist,
  createPatient,
  createTreatment,
  errorText,
  uniqueToken,
} from '../helpers/fixtures';
import { testPrisma } from '../helpers/test-db';

type Scenario = {
  dentist: Dentist;
  patient: Patient;
  treatment: TreatmentType;
};

async function createScenario(): Promise<Scenario> {
  return {
    dentist: await createDentist(),
    patient: await createPatient(),
    treatment: await createTreatment(),
  };
}

async function expectOverlapRejected(operation: Promise<unknown>): Promise<void> {
  let message = '';
  try {
    await operation;
  } catch (error) {
    message = errorText(error);
  }

  expect(message).toMatch(/no_overlap|23P01|exclusion constraint/i);
  // La violación de exclusión no debe confundirse con UNIQUE (23505) ni con
  // una clave foránea (23503).
  expect(message).not.toMatch(/23505|23503|unique constraint|foreign key/i);
}

beforeEach(async () => {
  await cleanupAll();
});

afterEach(async () => {
  await cleanupAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('no-superposición por odontólogo', () => {
  it('rechaza un solapamiento por Prisma y por SQL directo, y conserva el original', async () => {
    const { dentist, patient, treatment } = await createScenario();
    const original = await createAppointment({
      dentistId: dentist.id,
      patientId: patient.id,
      treatmentTypeId: treatment.id,
      startsAt: atUtc(9, 0),
      endsAt: atUtc(9, 45),
    });

    await expectOverlapRejected(
      createAppointment({
        dentistId: dentist.id,
        patientId: patient.id,
        treatmentTypeId: treatment.id,
        startsAt: atUtc(9, 30),
        endsAt: atUtc(10, 0),
      }),
    );

    await expectOverlapRejected(
      testPrisma.$executeRawUnsafe(
        `INSERT INTO "Appointment"
           ("id", "dentistId", "patientId", "treatmentTypeId", "startsAt", "endsAt",
            "status", "confirmationToken", "createdAt", "updatedAt")
         VALUES
           (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4, $5,
            'CONFIRMED'::"AppointmentStatus", $6, now(), now())`,
        dentist.id,
        patient.id,
        treatment.id,
        atUtc(9, 30),
        atUtc(10, 0),
        uniqueToken('sql-directo'),
      ),
    );

    const stored = await testPrisma.appointment.findUniqueOrThrow({
      where: { id: original.id },
    });

    expect(stored.status).toBe(AppointmentStatus.PENDING_CONFIRMATION);
    expect(await testPrisma.appointment.count()).toBe(1);
  });

  it('acepta turnos contiguos [startsAt, endsAt) y rechaza un minuto de solapamiento', async () => {
    const { dentist, patient, treatment } = await createScenario();

    await createAppointment({
      dentistId: dentist.id,
      patientId: patient.id,
      treatmentTypeId: treatment.id,
      startsAt: atUtc(9, 0),
      endsAt: atUtc(9, 30),
    });
    await createAppointment({
      dentistId: dentist.id,
      patientId: patient.id,
      treatmentTypeId: treatment.id,
      startsAt: atUtc(9, 30),
      endsAt: atUtc(10, 0),
    });

    expect(await testPrisma.appointment.count()).toBe(2);

    await expectOverlapRejected(
      createAppointment({
        dentistId: dentist.id,
        patientId: patient.id,
        treatmentTypeId: treatment.id,
        startsAt: atUtc(9, 29),
        endsAt: atUtc(9, 59),
      }),
    );

    expect(await testPrisma.appointment.count()).toBe(2);
  });

  it('los estados CANCELLED, RELEASED, COMPLETED y NO_SHOW liberan la franja', async () => {
    const closedStatuses = [
      AppointmentStatus.CANCELLED,
      AppointmentStatus.RELEASED,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.NO_SHOW,
    ];

    for (const status of closedStatuses) {
      const { dentist, patient, treatment } = await createScenario();

      const closed = await createAppointment({
        dentistId: dentist.id,
        patientId: patient.id,
        treatmentTypeId: treatment.id,
        startsAt: atUtc(10, 0),
        endsAt: atUtc(10, 30),
      });

      await testPrisma.appointment.update({
        where: { id: closed.id },
        data: { status },
      });

      const replacement = await createAppointment({
        dentistId: dentist.id,
        patientId: patient.id,
        treatmentTypeId: treatment.id,
        startsAt: atUtc(10, 0),
        endsAt: atUtc(10, 30),
      });

      const storedClosed = await testPrisma.appointment.findUniqueOrThrow({
        where: { id: closed.id },
      });

      expect(replacement.dentistId).toBe(dentist.id);
      expect(storedClosed.status).toBe(status);
    }
  });

  it('el constraint no_overlap existe con el predicado de estados vivos', async () => {
    const rows = await testPrisma.$queryRaw<Array<{ definition: string }>>`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = 'no_overlap'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.definition).toContain('EXCLUDE USING gist');
    expect(rows[0]?.definition).toContain('PENDING_CONFIRMATION');
    expect(rows[0]?.definition).toContain('CONFIRMED');
    expect(rows[0]?.definition).not.toContain('CANCELLED');
  });

  it('dos odontólogos pueden tener turnos en la misma franja', async () => {
    const first = await createScenario();
    const second = await createScenario();

    const firstAppointment = await createAppointment({
      dentistId: first.dentist.id,
      patientId: first.patient.id,
      treatmentTypeId: first.treatment.id,
      startsAt: atUtc(11, 0),
      endsAt: atUtc(11, 30),
    });
    const secondAppointment = await createAppointment({
      dentistId: second.dentist.id,
      patientId: second.patient.id,
      treatmentTypeId: second.treatment.id,
      startsAt: atUtc(11, 0),
      endsAt: atUtc(11, 30),
    });

    expect(await testPrisma.appointment.count()).toBe(2);
    expect(firstAppointment.dentistId).toBe(first.dentist.id);
    expect(secondAppointment.dentistId).toBe(second.dentist.id);
  });
});
