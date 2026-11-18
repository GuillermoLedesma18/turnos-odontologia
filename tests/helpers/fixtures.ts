import { randomUUID } from 'node:crypto';

import {
  AppointmentStatus,
  AuditAction,
  AuditActorType,
  NotificationChannel,
  NotificationKind,
  NotificationStatus,
} from '@/generated/prisma/client';
import type {
  Appointment,
  AuditLog,
  AvailabilityBlock,
  BlockedSlot,
  Dentist,
  DentistSession,
  NotificationLog,
  Patient,
  TreatmentType,
} from '@/generated/prisma/client';

import { testPrisma } from './test-db';

/**
 * Fixtures de integración.
 *
 * Todos los helpers usan `testPrisma` (base exclusiva de tests), nunca el
 * singleton de `src/lib/prisma.ts`. Los valores son únicos para que un fallo de
 * limpieza no oculte una colisión de UNIQUE.
 */

export function uniqueEmail(prefix = 'dentista'): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

export function uniquePhone(): string {
  return `+54911${randomUUID()}`;
}

export function uniqueToken(prefix = 'token'): string {
  return `${prefix}-${randomUUID()}`;
}

/** Instante UTC determinista para los tests de agenda. */
export function atUtc(hour: number, minute: number, day = 5): Date {
  return new Date(Date.UTC(2026, 0, day, hour, minute));
}

/** Hora de pared para `@db.Time(0)`; PostgreSQL ignora la fecha. */
export function timeAt(hour: number, minute: number): Date {
  return new Date(Date.UTC(1970, 0, 1, hour, minute));
}

export async function createDentist(
  overrides: {
    email?: string;
    fullName?: string;
    passwordHash?: string;
    phone?: string | null;
  } = {},
): Promise<Dentist> {
  return testPrisma.dentist.create({
    data: {
      email: overrides.email ?? uniqueEmail(),
      passwordHash: overrides.passwordHash ?? 'test-only-password-hash',
      fullName: overrides.fullName ?? 'Odontólogo de prueba',
      phone: overrides.phone ?? null,
    },
  });
}

export async function createDentistSession(
  overrides: {
    dentistId: string;
    token?: string;
    tokenHash?: string;
    createdAt?: Date;
    lastUsedAt?: Date;
    expiresAt?: Date;
    revokedAt?: Date | null;
  } = {} as { dentistId: string },
): Promise<DentistSession> {
  const now = new Date();
  const createdAt = overrides.createdAt ?? now;
  const lastUsedAt = overrides.lastUsedAt ?? createdAt;
  const expiresAt = overrides.expiresAt ?? new Date(createdAt.getTime() + 30 * 60 * 1000);

  return testPrisma.dentistSession.create({
    data: {
      dentistId: overrides.dentistId,
      tokenHash: overrides.tokenHash ?? overrides.token ?? `hash-${randomUUID()}`,
      createdAt,
      lastUsedAt,
      expiresAt,
      revokedAt: overrides.revokedAt ?? null,
    },
  });
}

export async function createPatient(
  overrides: {
    fullName?: string;
    phone?: string;
    email?: string | null;
    notes?: string | null;
  } = {},
): Promise<Patient> {
  return testPrisma.patient.create({
    data: {
      fullName: overrides.fullName ?? 'Paciente de prueba',
      phone: overrides.phone ?? uniquePhone(),
      email: overrides.email ?? null,
      notes: overrides.notes ?? null,
    },
  });
}

export async function createTreatment(
  overrides: {
    name?: string;
    durationMinutes?: number;
    description?: string | null;
    price?: string | null;
    active?: boolean;
  } = {},
): Promise<TreatmentType> {
  return testPrisma.treatmentType.create({
    data: {
      name: overrides.name ?? `Tratamiento ${randomUUID()}`,
      durationMinutes: overrides.durationMinutes ?? 30,
      description: overrides.description ?? null,
      price: overrides.price ?? null,
      active: overrides.active ?? true,
    },
  });
}

export async function createAppointment(overrides: {
  dentistId: string;
  patientId: string;
  treatmentTypeId: string;
  startsAt: Date;
  endsAt: Date;
  status?: AppointmentStatus;
  confirmationToken?: string;
  rescheduledFromId?: string | null;
}): Promise<Appointment> {
  return testPrisma.appointment.create({
    data: {
      dentistId: overrides.dentistId,
      patientId: overrides.patientId,
      treatmentTypeId: overrides.treatmentTypeId,
      startsAt: overrides.startsAt,
      endsAt: overrides.endsAt,
      status: overrides.status ?? AppointmentStatus.PENDING_CONFIRMATION,
      confirmationToken: overrides.confirmationToken ?? uniqueToken('turno'),
      rescheduledFromId: overrides.rescheduledFromId ?? null,
    },
  });
}

export async function createNotification(overrides: {
  appointmentId: string;
  channel?: NotificationChannel;
  kind?: NotificationKind;
  status?: NotificationStatus;
}): Promise<NotificationLog> {
  return testPrisma.notificationLog.create({
    data: {
      appointmentId: overrides.appointmentId,
      channel: overrides.channel ?? NotificationChannel.WHATSAPP,
      kind: overrides.kind ?? NotificationKind.REMINDER,
      status: overrides.status ?? NotificationStatus.QUEUED,
    },
  });
}

export async function createAvailabilityBlock(overrides: {
  dentistId: string;
  dayOfWeek?: number;
  startTime?: Date;
  endTime?: Date;
  active?: boolean;
}): Promise<AvailabilityBlock> {
  return testPrisma.availabilityBlock.create({
    data: {
      dentistId: overrides.dentistId,
      dayOfWeek: overrides.dayOfWeek ?? 1,
      startTime: overrides.startTime ?? timeAt(9, 0),
      endTime: overrides.endTime ?? timeAt(13, 0),
      active: overrides.active ?? true,
    },
  });
}

export async function createBlockedSlot(overrides: {
  dentistId: string;
  startsAt?: Date;
  endsAt?: Date;
  reason?: string | null;
}): Promise<BlockedSlot> {
  return testPrisma.blockedSlot.create({
    data: {
      dentistId: overrides.dentistId,
      startsAt: overrides.startsAt ?? atUtc(12, 0),
      endsAt: overrides.endsAt ?? atUtc(12, 30),
      reason: overrides.reason ?? 'Bloqueo de prueba',
    },
  });
}

export async function createAuditLog(
  overrides: {
    actorType?: AuditActorType;
    actorRef?: string | null;
    action?: AuditAction;
    entity?: string;
    entityId?: string;
    ip?: string | null;
  } = {},
): Promise<AuditLog> {
  return testPrisma.auditLog.create({
    data: {
      actorType: overrides.actorType ?? AuditActorType.SYSTEM,
      actorRef: overrides.actorRef ?? null,
      action: overrides.action ?? AuditAction.READ,
      entity: overrides.entity ?? 'Dentist',
      entityId: overrides.entityId ?? randomUUID(),
      ip: overrides.ip ?? null,
    },
  });
}

/**
 * Limpia la base de tests en orden de FKs.
 *
 * Solo se usa en la base exclusiva de tests (el guard lo garantiza antes de
 * cargar cualquier test). No es un helper para la base de desarrollo.
 */
export async function cleanupAll(): Promise<void> {
  await testPrisma.notificationLog.deleteMany();
  // La auto-FK de reprogramación impide borrar el original mientras el hijo
  // exista. Se desarma primero y luego se borran todos los turnos.
  await testPrisma.appointment.updateMany({ data: { rescheduledFromId: null } });
  await testPrisma.appointment.deleteMany();
  await testPrisma.availabilityBlock.deleteMany();
  await testPrisma.blockedSlot.deleteMany();
  await testPrisma.auditLog.deleteMany();
  await testPrisma.treatmentType.deleteMany();
  await testPrisma.dentistSession.deleteMany();
  await testPrisma.patient.deleteMany();
  await testPrisma.dentist.deleteMany();
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
