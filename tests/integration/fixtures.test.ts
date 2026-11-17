import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  atUtc,
  cleanupAll,
  createAppointment,
  createDentist,
  createNotification,
  createPatient,
  createTreatment,
  createAvailabilityBlock,
  createBlockedSlot,
} from '../helpers/fixtures';
import { testPrisma } from '../helpers/test-db';

/**
 * Humo de los helpers: crean filas en la base exclusiva de tests y las limpian
 * en orden de FKs. No usan el singleton de la aplicación ni la base de
 * desarrollo.
 */

beforeEach(async () => {
  await cleanupAll();
});

afterEach(async () => {
  await cleanupAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('fixtures de tests', () => {
  it('crea y limpia odontólogo, paciente, tratamiento, turno y notificación', async () => {
    const dentist = await createDentist();
    const patient = await createPatient();
    const treatment = await createTreatment();
    const availability = await createAvailabilityBlock({ dentistId: dentist.id });
    const blockedSlot = await createBlockedSlot({ dentistId: dentist.id });
    const appointment = await createAppointment({
      dentistId: dentist.id,
      patientId: patient.id,
      treatmentTypeId: treatment.id,
      startsAt: atUtc(9, 0),
      endsAt: atUtc(9, 30),
    });
    const notification = await createNotification({ appointmentId: appointment.id });

    expect(availability.dentistId).toBe(dentist.id);
    expect(blockedSlot.dentistId).toBe(dentist.id);
    expect(appointment.status).toBe('PENDING_CONFIRMATION');
    expect(notification.appointmentId).toBe(appointment.id);

    expect(await testPrisma.dentist.count()).toBe(1);
    expect(await testPrisma.patient.count()).toBe(1);
    expect(await testPrisma.treatmentType.count()).toBe(1);
    expect(await testPrisma.appointment.count()).toBe(1);
    expect(await testPrisma.notificationLog.count()).toBe(1);

    await cleanupAll();

    expect(await testPrisma.dentist.count()).toBe(0);
    expect(await testPrisma.patient.count()).toBe(0);
    expect(await testPrisma.treatmentType.count()).toBe(0);
    expect(await testPrisma.appointment.count()).toBe(0);
    expect(await testPrisma.notificationLog.count()).toBe(0);
    expect(await testPrisma.availabilityBlock.count()).toBe(0);
    expect(await testPrisma.blockedSlot.count()).toBe(0);
  });
});
