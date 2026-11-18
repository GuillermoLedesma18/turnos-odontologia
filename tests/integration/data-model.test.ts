import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AppointmentStatus,
  AuditAction,
  AuditActorType,
  NotificationChannel,
} from '@/generated/prisma/client';

import {
  atUtc,
  cleanupAll,
  createAppointment,
  createAuditLog,
  createAvailabilityBlock,
  createBlockedSlot,
  createDentist,
  createNotification,
  createPatient,
  createTreatment,
  errorText,
  timeAt,
  uniqueToken,
} from '../helpers/fixtures';
import { testPrisma } from '../helpers/test-db';

async function expectDatabaseRejection(
  operation: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  let message = '';
  try {
    await operation;
  } catch (error) {
    message = errorText(error);
  }

  expect(message).toMatch(pattern);
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

describe('integridad de columnas en PostgreSQL', () => {
  it('rechaza duración de tratamiento <= 0 y conserva el valor original', async () => {
    const treatment = await createTreatment({ durationMinutes: 30 });

    await expectDatabaseRejection(
      createTreatment({ durationMinutes: 0 }),
      /treatment_duration_check|23514|check constraint/i,
    );

    await expectDatabaseRejection(
      testPrisma.treatmentType.update({
        where: { id: treatment.id },
        data: { durationMinutes: 0 },
      }),
      /treatment_duration_check|23514|check constraint/i,
    );

    const stored = await testPrisma.treatmentType.findUniqueOrThrow({
      where: { id: treatment.id },
    });
    expect(stored.durationMinutes).toBe(30);
  });

  it('rechaza horarios de disponibilidad y bloqueos con inicio >= fin', async () => {
    const dentist = await createDentist();

    await expectDatabaseRejection(
      createAvailabilityBlock({
        dentistId: dentist.id,
        startTime: timeAt(10, 0),
        endTime: timeAt(10, 0),
      }),
      /availability_time_check|23514|check constraint/i,
    );

    await expectDatabaseRejection(
      createBlockedSlot({
        dentistId: dentist.id,
        startsAt: atUtc(10, 0),
        endsAt: atUtc(9, 0),
      }),
      /blocked_slot_time_check|23514|check constraint/i,
    );

    expect(await testPrisma.availabilityBlock.count()).toBe(0);
    expect(await testPrisma.blockedSlot.count()).toBe(0);
  });

  it('rechaza turnos con startsAt >= endsAt', async () => {
    const dentist = await createDentist();
    const patient = await createPatient();
    const treatment = await createTreatment();

    await expectDatabaseRejection(
      createAppointment({
        dentistId: dentist.id,
        patientId: patient.id,
        treatmentTypeId: treatment.id,
        startsAt: atUtc(9, 0),
        endsAt: atUtc(9, 0),
      }),
      /appointment_time_range_check|23514|check constraint/i,
    );

    expect(await testPrisma.appointment.count()).toBe(0);
  });

  it('rechaza email de odontólogo, teléfono de paciente y token repetidos', async () => {
    const dentist = await createDentist();
    await expectDatabaseRejection(
      createDentist({ email: dentist.email }),
      /Dentist_email_key|23505|unique constraint/i,
    );
    expect(await testPrisma.dentist.count()).toBe(1);

    const patient = await createPatient();
    await expectDatabaseRejection(
      createPatient({ phone: patient.phone }),
      /Patient_phone_key|23505|unique constraint/i,
    );
    expect(await testPrisma.patient.count()).toBe(1);

    const first = await createDentist();
    const firstPatient = await createPatient();
    const firstTreatment = await createTreatment();
    const token = uniqueToken('repetido');
    const appointment = await createAppointment({
      dentistId: first.id,
      patientId: firstPatient.id,
      treatmentTypeId: firstTreatment.id,
      startsAt: atUtc(9, 0),
      endsAt: atUtc(9, 30),
      confirmationToken: token,
    });

    const second = await createDentist();
    const secondPatient = await createPatient();
    const secondTreatment = await createTreatment();

    await expectDatabaseRejection(
      createAppointment({
        dentistId: second.id,
        patientId: secondPatient.id,
        treatmentTypeId: secondTreatment.id,
        startsAt: atUtc(11, 0),
        endsAt: atUtc(11, 30),
        confirmationToken: token,
      }),
      /Appointment_confirmationToken_key|23505|unique constraint/i,
    );

    expect(
      await testPrisma.appointment.findUnique({ where: { id: appointment.id } }),
    ).not.toBeNull();
  });

  it('rechaza valores de enum inválidos en turnos y auditoría', async () => {
    const dentist = await createDentist();
    const patient = await createPatient();
    const treatment = await createTreatment();
    const appointment = await createAppointment({
      dentistId: dentist.id,
      patientId: patient.id,
      treatmentTypeId: treatment.id,
      startsAt: atUtc(12, 0),
      endsAt: atUtc(12, 30),
      status: AppointmentStatus.CONFIRMED,
    });

    await expectDatabaseRejection(
      testPrisma.$executeRawUnsafe(
        `UPDATE "Appointment" SET "status" = 'INVALID_STATUS' WHERE "id" = $1::uuid`,
        appointment.id,
      ),
      /invalid input value for enum|22P02|AppointmentStatus/i,
    );

    const storedAppointment = await testPrisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(storedAppointment.status).toBe(AppointmentStatus.CONFIRMED);

    const audit = await createAuditLog({
      actorType: AuditActorType.SYSTEM,
      action: AuditAction.READ,
      entity: 'Appointment',
      entityId: appointment.id,
    });

    await expectDatabaseRejection(
      testPrisma.$executeRawUnsafe(
        `INSERT INTO "AuditLog" ("actorType", "action", "entity", "entityId")
         VALUES ('SYSTEM', 'INVALID_ACTION'::"AuditAction", 'Appointment', $1)`,
        appointment.id,
      ),
      /invalid input value for enum|22P02|AuditAction/i,
    );

    expect(await testPrisma.auditLog.count()).toBe(1);
    expect(await testPrisma.auditLog.findUnique({ where: { id: audit.id } })).not.toBeNull();
  });
});

describe('relaciones y filtros tipados', () => {
  it('un turno referencia una fila de cada entidad, admite varias notificaciones y una reprogramación', async () => {
    const dentist = await createDentist();
    const patient = await createPatient();
    const treatment = await createTreatment();

    const original = await createAppointment({
      dentistId: dentist.id,
      patientId: patient.id,
      treatmentTypeId: treatment.id,
      startsAt: atUtc(9, 0),
      endsAt: atUtc(9, 30),
    });
    const rescheduled = await createAppointment({
      dentistId: dentist.id,
      patientId: patient.id,
      treatmentTypeId: treatment.id,
      startsAt: atUtc(10, 0),
      endsAt: atUtc(10, 30),
      rescheduledFromId: original.id,
    });

    await createNotification({ appointmentId: original.id });
    await createNotification({
      appointmentId: original.id,
      channel: NotificationChannel.EMAIL,
    });

    expect(original.dentistId).toBe(dentist.id);
    expect(original.patientId).toBe(patient.id);
    expect(original.treatmentTypeId).toBe(treatment.id);
    expect(rescheduled.rescheduledFromId).toBe(original.id);

    expect(await testPrisma.appointment.count({ where: { dentistId: dentist.id } })).toBe(2);
    expect(await testPrisma.appointment.count({ where: { patientId: patient.id } })).toBe(2);
    expect(await testPrisma.appointment.count({ where: { treatmentTypeId: treatment.id } })).toBe(
      2,
    );
    expect(await testPrisma.notificationLog.count({ where: { appointmentId: original.id } })).toBe(
      2,
    );
  });

  it('filtra turnos por estado y notificaciones por canal con valores tipados', async () => {
    const dentist = await createDentist();
    const patient = await createPatient();
    const treatment = await createTreatment();

    const confirmed = await createAppointment({
      dentistId: dentist.id,
      patientId: patient.id,
      treatmentTypeId: treatment.id,
      startsAt: atUtc(9, 0),
      endsAt: atUtc(9, 30),
      status: AppointmentStatus.CONFIRMED,
    });
    await createAppointment({
      dentistId: dentist.id,
      patientId: patient.id,
      treatmentTypeId: treatment.id,
      startsAt: atUtc(9, 0),
      endsAt: atUtc(9, 30),
      status: AppointmentStatus.CANCELLED,
    });

    await createNotification({
      appointmentId: confirmed.id,
      channel: NotificationChannel.WHATSAPP,
    });
    await createNotification({
      appointmentId: confirmed.id,
      channel: NotificationChannel.EMAIL,
    });

    const confirmedAppointments = await testPrisma.appointment.findMany({
      where: { status: AppointmentStatus.CONFIRMED },
    });
    expect(confirmedAppointments.map((appointment) => appointment.id)).toEqual([confirmed.id]);

    const whatsappNotifications = await testPrisma.notificationLog.findMany({
      where: { channel: NotificationChannel.WHATSAPP },
    });
    expect(whatsappNotifications).toHaveLength(1);
    expect(whatsappNotifications[0]?.appointmentId).toBe(confirmed.id);
  });
});

describe('acciones referenciales', () => {
  it('Restrict impide borrar tratamiento, paciente u odontólogo con turnos', async () => {
    const dentist = await createDentist();
    const patient = await createPatient();
    const treatment = await createTreatment();
    await createAppointment({
      dentistId: dentist.id,
      patientId: patient.id,
      treatmentTypeId: treatment.id,
      startsAt: atUtc(9, 0),
      endsAt: atUtc(9, 30),
    });

    await expectDatabaseRejection(
      testPrisma.treatmentType.delete({ where: { id: treatment.id } }),
      /foreign key|23503|P2003/i,
    );
    await expectDatabaseRejection(
      testPrisma.patient.delete({ where: { id: patient.id } }),
      /foreign key|23503|P2003/i,
    );
    await expectDatabaseRejection(
      testPrisma.dentist.delete({ where: { id: dentist.id } }),
      /foreign key|23503|P2003/i,
    );

    expect(await testPrisma.treatmentType.count()).toBe(1);
    expect(await testPrisma.patient.count()).toBe(1);
    expect(await testPrisma.dentist.count()).toBe(1);
    expect(await testPrisma.appointment.count()).toBe(1);
  });

  it('Restrict protege el turno original de una reprogramación', async () => {
    const dentist = await createDentist();
    const patient = await createPatient();
    const treatment = await createTreatment();

    const original = await createAppointment({
      dentistId: dentist.id,
      patientId: patient.id,
      treatmentTypeId: treatment.id,
      startsAt: atUtc(9, 0),
      endsAt: atUtc(9, 30),
    });
    const rescheduled = await createAppointment({
      dentistId: dentist.id,
      patientId: patient.id,
      treatmentTypeId: treatment.id,
      startsAt: atUtc(10, 0),
      endsAt: atUtc(10, 30),
      rescheduledFromId: original.id,
    });

    await expectDatabaseRejection(
      testPrisma.appointment.delete({ where: { id: original.id } }),
      /foreign key|23503|P2003/i,
    );

    expect(await testPrisma.appointment.findUnique({ where: { id: original.id } })).not.toBeNull();
    expect(
      await testPrisma.appointment.findUnique({ where: { id: rescheduled.id } }),
    ).not.toBeNull();
  });

  it('Cascade elimina disponibilidad y bloqueos junto con el odontólogo', async () => {
    const dentist = await createDentist();
    await createAvailabilityBlock({ dentistId: dentist.id });
    await createBlockedSlot({ dentistId: dentist.id });

    await testPrisma.dentist.delete({ where: { id: dentist.id } });

    expect(await testPrisma.availabilityBlock.count()).toBe(0);
    expect(await testPrisma.blockedSlot.count()).toBe(0);
    expect(await testPrisma.dentist.count()).toBe(0);
  });

  it('Cascade elimina notificaciones en una baja excepcional del turno', async () => {
    const dentist = await createDentist();
    const patient = await createPatient();
    const treatment = await createTreatment();
    const appointment = await createAppointment({
      dentistId: dentist.id,
      patientId: patient.id,
      treatmentTypeId: treatment.id,
      startsAt: atUtc(9, 0),
      endsAt: atUtc(9, 30),
    });
    await createNotification({ appointmentId: appointment.id });

    await testPrisma.appointment.delete({ where: { id: appointment.id } });

    expect(await testPrisma.notificationLog.count()).toBe(0);
  });

  it('AuditLog sobrevive al borrado de la entidad referenciada', async () => {
    const dentist = await createDentist();
    const audit = await createAuditLog({
      entity: 'Dentist',
      entityId: dentist.id,
      actorRef: dentist.id,
    });

    await testPrisma.dentist.delete({ where: { id: dentist.id } });

    const stored = await testPrisma.auditLog.findUniqueOrThrow({ where: { id: audit.id } });
    expect(stored.entity).toBe('Dentist');
    expect(stored.entityId).toBe(dentist.id);
  });

  it('cancelar un turno conserva el turno y sus notificaciones', async () => {
    const dentist = await createDentist();
    const patient = await createPatient();
    const treatment = await createTreatment();
    const appointment = await createAppointment({
      dentistId: dentist.id,
      patientId: patient.id,
      treatmentTypeId: treatment.id,
      startsAt: atUtc(9, 0),
      endsAt: atUtc(9, 30),
    });
    const notification = await createNotification({ appointmentId: appointment.id });

    await testPrisma.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.CANCELLED, cancelledAt: new Date() },
    });

    const storedAppointment = await testPrisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(storedAppointment.status).toBe(AppointmentStatus.CANCELLED);
    expect(
      await testPrisma.notificationLog.findUnique({ where: { id: notification.id } }),
    ).not.toBeNull();
  });
});

describe('índices y tipos nativos', () => {
  it('el catálogo contiene todos los índices esperados y cada FK tiene índice', async () => {
    const indexRows = await testPrisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    `;
    const indexes = new Set(indexRows.map((row) => row.indexname));

    const expectedIndexes = [
      'Dentist_email_key',
      'AvailabilityBlock_dentistId_dayOfWeek_idx',
      'BlockedSlot_dentistId_startsAt_endsAt_idx',
      'TreatmentType_active_idx',
      'Patient_phone_key',
      'Appointment_confirmationToken_key',
      'Appointment_dentistId_startsAt_idx',
      'Appointment_patientId_startsAt_idx',
      'Appointment_status_idx',
      'Appointment_treatmentTypeId_idx',
      'Appointment_rescheduledFromId_idx',
      'NotificationLog_appointmentId_createdAt_idx',
      'AuditLog_at_idx',
      'AuditLog_entity_entityId_idx',
    ];

    for (const expected of expectedIndexes) {
      expect(indexes.has(expected), `falta el índice ${expected}`).toBe(true);
    }

    const fkCoverage = await testPrisma.$queryRaw<
      Array<{ constraint_name: string; covered: boolean }>
    >`
      SELECT c.conname AS constraint_name,
             EXISTS (
               SELECT 1
               FROM pg_index i
               WHERE i.indrelid = c.conrelid
                 AND i.indisvalid
                 AND i.indkey[0] = c.conkey[1]
             ) AS covered
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.connamespace = 'public'::regnamespace
    `;

    expect(fkCoverage).toHaveLength(8);
    for (const fk of fkCoverage) {
      expect(fk.covered, `la FK ${fk.constraint_name} no tiene índice`).toBe(true);
    }
  });

  it('los planes de agenda y auditoría pueden apoyarse en los índices declarados', async () => {
    const plans = await testPrisma.$transaction(async (tx) => {
      // En tablas vacías el planner prefiere seq scan; se desactiva solo dentro
      // de la transacción para comprobar que el índice es utilizable.
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');

      const appointmentPlan = await tx.$queryRaw<Array<Record<string, string>>>`
        EXPLAIN SELECT *
        FROM "Appointment"
        WHERE "dentistId" = ${randomUUID()}::uuid
      `;
      const auditPlan = await tx.$queryRaw<Array<Record<string, string>>>`
        EXPLAIN SELECT *
        FROM "AuditLog"
        WHERE "entity" = 'Dentist'
          AND "entityId" = ${randomUUID()}
      `;

      return { appointmentPlan, auditPlan };
    });

    expect(JSON.stringify(plans.appointmentPlan)).toContain('Appointment_dentistId_startsAt_idx');
    expect(JSON.stringify(plans.auditPlan)).toContain('AuditLog_entity_entityId_idx');
  });

  it('usa timestamptz, date, time, numeric(12,2) e inet y hace round-trip', async () => {
    const columns = await testPrisma.$queryRaw<
      Array<{
        table_name: string;
        column_name: string;
        data_type: string;
        udt_name: string;
        numeric_precision: number | null;
        numeric_scale: number | null;
        datetime_precision: number | null;
      }>
    >`
      SELECT table_name, column_name, data_type, udt_name,
             numeric_precision, numeric_scale, datetime_precision
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('Appointment', 'AvailabilityBlock', 'TreatmentType', 'AuditLog')
    `;

    const byName = new Map(
      columns.map((column) => [`${column.table_name}.${column.column_name}`, column]),
    );

    expect(byName.get('Appointment.startsAt')).toMatchObject({
      data_type: 'timestamp with time zone',
      datetime_precision: 3,
    });
    expect(byName.get('AvailabilityBlock.startTime')).toMatchObject({
      data_type: 'time without time zone',
      datetime_precision: 0,
    });
    expect(byName.get('AvailabilityBlock.validFrom')).toMatchObject({ data_type: 'date' });
    expect(byName.get('TreatmentType.price')).toMatchObject({
      data_type: 'numeric',
      numeric_precision: 12,
      numeric_scale: 2,
    });
    expect(byName.get('AuditLog.ip')).toMatchObject({ udt_name: 'inet' });

    const dentist = await createDentist();
    const patient = await createPatient();
    const treatment = await createTreatment({ price: '1234.56' });
    const startsAt = new Date('2026-03-15T12:34:56.789Z');
    const endsAt = new Date('2026-03-15T13:04:56.789Z');

    const appointment = await createAppointment({
      dentistId: dentist.id,
      patientId: patient.id,
      treatmentTypeId: treatment.id,
      startsAt,
      endsAt,
    });

    expect(appointment.startsAt.toISOString()).toBe(startsAt.toISOString());
    expect(appointment.endsAt.toISOString()).toBe(endsAt.toISOString());
    expect(treatment.price?.toFixed(2)).toBe('1234.56');

    const availability = await createAvailabilityBlock({
      dentistId: dentist.id,
      startTime: timeAt(9, 0),
      endTime: timeAt(13, 0),
    });

    expect(availability.startTime.toISOString()).toBe('1970-01-01T09:00:00.000Z');
    expect(availability.endTime.toISOString()).toBe('1970-01-01T13:00:00.000Z');

    const audit = await createAuditLog({
      entity: 'Appointment',
      entityId: randomUUID(),
      ip: '203.0.113.10',
    });
    expect(audit.ip).toBe('203.0.113.10');
  });
});
