-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'CANCELLED', 'RELEASED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('REMINDER', 'CONFIRMATION', 'CANCELLATION', 'RELEASE_NOTICE');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('DENTIST', 'PATIENT_TOKEN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT');

-- CreateTable
CREATE TABLE "Dentist" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Dentist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityBlock" (
    "id" UUID NOT NULL,
    "dentistId" UUID NOT NULL,
    "dayOfWeek" SMALLINT NOT NULL,
    "startTime" TIME(0) NOT NULL,
    "endTime" TIME(0) NOT NULL,
    "validFrom" DATE,
    "validTo" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AvailabilityBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedSlot" (
    "id" UUID NOT NULL,
    "dentistId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "BlockedSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentType" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TreatmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "dentistId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "treatmentTypeId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "confirmationToken" TEXT NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "releasedAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "rescheduledFromId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "attempt" SMALLINT NOT NULL DEFAULT 1,
    "error" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorRef" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "ip" INET,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dentist_email_key" ON "Dentist"("email");

-- CreateIndex
CREATE INDEX "AvailabilityBlock_dentistId_dayOfWeek_idx" ON "AvailabilityBlock"("dentistId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "BlockedSlot_dentistId_startsAt_endsAt_idx" ON "BlockedSlot"("dentistId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "TreatmentType_active_idx" ON "TreatmentType"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_phone_key" ON "Patient"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_confirmationToken_key" ON "Appointment"("confirmationToken");

-- CreateIndex
CREATE INDEX "Appointment_dentistId_startsAt_idx" ON "Appointment"("dentistId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_patientId_startsAt_idx" ON "Appointment"("patientId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "Appointment_treatmentTypeId_idx" ON "Appointment"("treatmentTypeId");

-- CreateIndex
CREATE INDEX "Appointment_rescheduledFromId_idx" ON "Appointment"("rescheduledFromId");

-- CreateIndex
CREATE INDEX "NotificationLog_appointmentId_createdAt_idx" ON "NotificationLog"("appointmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "AvailabilityBlock" ADD CONSTRAINT "AvailabilityBlock_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "Dentist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedSlot" ADD CONSTRAINT "BlockedSlot_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "Dentist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "Dentist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_treatmentTypeId_fkey" FOREIGN KEY ("treatmentTypeId") REFERENCES "TreatmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_rescheduledFromId_fkey" FOREIGN KEY ("rescheduledFromId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- C-02 core-models — bloque manual (excepción explícita a la regla dura C9)
--
-- Prisma 7.10.1 no expresa en PSL CREATE EXTENSION, EXCLUDE USING gist,
-- predicados parciales de exclusión ni CHECK de tabla. Este bloque se agrega
-- al archivo generado antes de aplicar la migración y no se reescribe después:
-- cualquier cambio posterior va en una migración nueva.
--
-- Invariante: un odontólogo no puede tener dos turnos superpuestos en estados
-- vivos. El rango es semiabierto [startsAt, endsAt), así que los turnos
-- contiguos no se consideran superpuestos.
-- ============================================================================

-- btree_gist aporta la clase de operador de igualdad para UUID, que GiST no
-- incluye por defecto.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Anti-superposición por odontólogo, solo para turnos vivos.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "no_overlap"
  EXCLUDE USING gist (
    "dentistId" WITH =,
    tstzrange("startsAt", "endsAt") WITH &&
  ) WHERE ("status" IN ('PENDING_CONFIRMATION', 'CONFIRMED'));

-- Rango temporal válido del turno: no se permiten rangos vacíos ni invertidos.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_time_range_check"
  CHECK ("endsAt" > "startsAt");

-- Duración de tratamiento estrictamente positiva.
ALTER TABLE "TreatmentType"
  ADD CONSTRAINT "treatment_duration_check"
  CHECK ("durationMinutes" > 0);

-- Horario de disponibilidad válido (hora de pared, sin zona).
ALTER TABLE "AvailabilityBlock"
  ADD CONSTRAINT "availability_time_check"
  CHECK ("startTime" < "endTime");

-- Bloqueo puntual con rango temporal válido.
ALTER TABLE "BlockedSlot"
  ADD CONSTRAINT "blocked_slot_time_check"
  CHECK ("startsAt" < "endsAt");
