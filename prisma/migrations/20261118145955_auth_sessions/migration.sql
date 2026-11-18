-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'LOGIN';
ALTER TYPE "AuditAction" ADD VALUE 'LOGIN_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'LOGOUT';

-- CreateTable
CREATE TABLE "DentistSession" (
    "id" UUID NOT NULL,
    "dentistId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DentistSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DentistSession_tokenHash_key" ON "DentistSession"("tokenHash");

-- CreateIndex
CREATE INDEX "DentistSession_dentistId_idx" ON "DentistSession"("dentistId");

-- CreateIndex
CREATE INDEX "DentistSession_expiresAt_idx" ON "DentistSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "DentistSession" ADD CONSTRAINT "DentistSession_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "Dentist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
