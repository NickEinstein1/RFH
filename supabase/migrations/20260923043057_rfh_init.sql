-- RFH Care — full schema for Supabase Postgres
-- Applied via: supabase db push  OR  psql "$DIRECT_URL" -f this file
-- Nest/Prisma remains the application API; Supabase hosts PostgreSQL.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'NURSE', 'CAREGIVER', 'FAMILY_VIEWER');

-- CreateEnum
CREATE TYPE "ResidentStatus" AS ENUM ('ACTIVE', 'DISCHARGED');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MedOrderStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "MedOrderIntakeStatus" AS ENUM ('UPLOADED', 'EXTRACTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MedOutcome" AS ENUM ('GIVEN', 'REFUSED', 'HELD', 'MISSED');

-- CreateEnum
CREATE TYPE "MedAlertType" AS ENUM ('MISSED', 'LATE', 'REFUSED');

-- CreateEnum
CREATE TYPE "MedAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('PROGRESS', 'SHIFT', 'COMMUNICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "CarePlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CareTaskCategory" AS ENUM ('ADL', 'IADL', 'CARE', 'OTHER');

-- CreateEnum
CREATE TYPE "ShiftWindow" AS ENUM ('DAY', 'EVENING', 'NIGHT', 'ANY');

-- CreateEnum
CREATE TYPE "TaskOutcome" AS ENUM ('DONE', 'REFUSED', 'UNABLE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('CPR', 'FIRST_AID', 'FOOD_HANDLER', 'NAC', 'HCA', 'RN_LICENSE', 'LPN_LICENSE', 'TB_TEST', 'BACKGROUND_CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "CredentialAlertType" AS ENUM ('EXPIRING_SOON', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "IncidentCategory" AS ENUM ('FALL', 'MED_ERROR', 'BEHAVIOR', 'INJURY', 'ELOPEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'CLOSED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resident" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "sex" "Sex" NOT NULL DEFAULT 'UNKNOWN',
    "mrn" TEXT,
    "room" TEXT,
    "status" "ResidentStatus" NOT NULL DEFAULT 'ACTIVE',
    "admitDate" DATE NOT NULL,
    "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photoUrl" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedOrderIntake" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "dataUrl" TEXT,
    "rawText" TEXT,
    "drafts" JSONB,
    "status" "MedOrderIntakeStatus" NOT NULL DEFAULT 'UPLOADED',
    "extractNote" TEXT,
    "reviewNotes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedOrderIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyResidentLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyResidentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "scheduleTimes" TEXT[],
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "isPrn" BOOLEAN NOT NULL DEFAULT false,
    "instructions" TEXT,
    "brand" TEXT,
    "rxNumber" TEXT,
    "imprint" TEXT,
    "categoryLabel" TEXT,
    "prescriber" TEXT,
    "highAlert" BOOLEAN NOT NULL DEFAULT false,
    "status" "MedOrderStatus" NOT NULL DEFAULT 'ACTIVE',
    "intakeId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedAdministration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "administeredAt" TIMESTAMP(3),
    "administeredById" TEXT,
    "outcome" "MedOutcome" NOT NULL,
    "notes" TEXT,
    "prnRouteSite" TEXT,
    "prnReason" TEXT,
    "prnBmi" TEXT,
    "prnBmiOther" TEXT,
    "prnResult" TEXT,
    "prnMse" TEXT,
    "prnMseOther" TEXT,
    "prnPainScore" INTEGER,
    "clientEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedAdministration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedAlert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "administrationId" TEXT NOT NULL,
    "type" "MedAlertType" NOT NULL,
    "status" "MedAlertStatus" NOT NULL DEFAULT 'OPEN',
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "noteType" "NoteType" NOT NULL DEFAULT 'PROGRESS',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goals" TEXT,
    "status" "CarePlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "formData" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "carePlanId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "category" "CareTaskCategory" NOT NULL DEFAULT 'ADL',
    "title" TEXT NOT NULL,
    "shift" "ShiftWindow" NOT NULL DEFAULT 'ANY',
    "scheduleTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "instructions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCompletion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "careTaskId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "outcome" "TaskOutcome" NOT NULL,
    "notes" TEXT,
    "clientEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL,
    "label" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "issuedAt" DATE,
    "expiresAt" DATE NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialAlert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "type" "CredentialAlertType" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredentialAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "category" "IncidentCategory" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "immediateActions" TEXT,
    "formData" JSONB,
    "clientEventId" TEXT,
    "closedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tenant_organizationId_idx" ON "Tenant"("organizationId");

-- CreateIndex
CREATE INDEX "User_tenantId_deletedAt_idx" ON "User"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_tokenHash_idx" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_tokenHash_idx" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Resident_tenantId_deletedAt_status_idx" ON "Resident"("tenantId", "deletedAt", "status");

-- CreateIndex
CREATE INDEX "Resident_tenantId_lastName_firstName_idx" ON "Resident"("tenantId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "MedOrderIntake_tenantId_residentId_status_idx" ON "MedOrderIntake"("tenantId", "residentId", "status");

-- CreateIndex
CREATE INDEX "MedOrderIntake_tenantId_createdAt_idx" ON "MedOrderIntake"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "FamilyResidentLink_tenantId_userId_deletedAt_idx" ON "FamilyResidentLink"("tenantId", "userId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyResidentLink_tenantId_userId_residentId_key" ON "FamilyResidentLink"("tenantId", "userId", "residentId");

-- CreateIndex
CREATE INDEX "MedicationOrder_tenantId_residentId_status_deletedAt_idx" ON "MedicationOrder"("tenantId", "residentId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "MedicationOrder_intakeId_idx" ON "MedicationOrder"("intakeId");

-- CreateIndex
CREATE INDEX "MedAdministration_tenantId_residentId_scheduledAt_idx" ON "MedAdministration"("tenantId", "residentId", "scheduledAt");

-- CreateIndex
CREATE INDEX "MedAdministration_tenantId_outcome_scheduledAt_idx" ON "MedAdministration"("tenantId", "outcome", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "MedAdministration_tenantId_clientEventId_key" ON "MedAdministration"("tenantId", "clientEventId");

-- CreateIndex
CREATE INDEX "MedAlert_tenantId_status_triggeredAt_idx" ON "MedAlert"("tenantId", "status", "triggeredAt");

-- CreateIndex
CREATE INDEX "ProgressNote_tenantId_residentId_occurredAt_idx" ON "ProgressNote"("tenantId", "residentId", "occurredAt");

-- CreateIndex
CREATE INDEX "ProgressNote_tenantId_deletedAt_idx" ON "ProgressNote"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "CarePlan_tenantId_residentId_status_deletedAt_idx" ON "CarePlan"("tenantId", "residentId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "CareTask_tenantId_residentId_isActive_deletedAt_idx" ON "CareTask"("tenantId", "residentId", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "CareTask_tenantId_carePlanId_idx" ON "CareTask"("tenantId", "carePlanId");

-- CreateIndex
CREATE INDEX "TaskCompletion_tenantId_residentId_scheduledAt_idx" ON "TaskCompletion"("tenantId", "residentId", "scheduledAt");

-- CreateIndex
CREATE INDEX "TaskCompletion_tenantId_careTaskId_scheduledAt_idx" ON "TaskCompletion"("tenantId", "careTaskId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCompletion_tenantId_clientEventId_key" ON "TaskCompletion"("tenantId", "clientEventId");

-- CreateIndex
CREATE INDEX "StaffCredential_tenantId_userId_deletedAt_idx" ON "StaffCredential"("tenantId", "userId", "deletedAt");

-- CreateIndex
CREATE INDEX "StaffCredential_tenantId_expiresAt_idx" ON "StaffCredential"("tenantId", "expiresAt");

-- CreateIndex
CREATE INDEX "CredentialAlert_tenantId_status_triggeredAt_idx" ON "CredentialAlert"("tenantId", "status", "triggeredAt");

-- CreateIndex
CREATE INDEX "Incident_tenantId_residentId_occurredAt_idx" ON "Incident"("tenantId", "residentId", "occurredAt");

-- CreateIndex
CREATE INDEX "Incident_tenantId_status_deletedAt_idx" ON "Incident"("tenantId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "Incident_tenantId_category_severity_idx" ON "Incident"("tenantId", "category", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_tenantId_clientEventId_key" ON "Incident"("tenantId", "clientEventId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_resourceType_resourceId_idx" ON "AuditLog"("tenantId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_actorId_createdAt_idx" ON "AuditLog"("tenantId", "actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedOrderIntake" ADD CONSTRAINT "MedOrderIntake_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedOrderIntake" ADD CONSTRAINT "MedOrderIntake_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedOrderIntake" ADD CONSTRAINT "MedOrderIntake_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedOrderIntake" ADD CONSTRAINT "MedOrderIntake_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyResidentLink" ADD CONSTRAINT "FamilyResidentLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyResidentLink" ADD CONSTRAINT "FamilyResidentLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyResidentLink" ADD CONSTRAINT "FamilyResidentLink_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationOrder" ADD CONSTRAINT "MedicationOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationOrder" ADD CONSTRAINT "MedicationOrder_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationOrder" ADD CONSTRAINT "MedicationOrder_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "MedOrderIntake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedAdministration" ADD CONSTRAINT "MedAdministration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedAdministration" ADD CONSTRAINT "MedAdministration_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MedicationOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedAdministration" ADD CONSTRAINT "MedAdministration_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedAdministration" ADD CONSTRAINT "MedAdministration_administeredById_fkey" FOREIGN KEY ("administeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedAlert" ADD CONSTRAINT "MedAlert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedAlert" ADD CONSTRAINT "MedAlert_administrationId_fkey" FOREIGN KEY ("administrationId") REFERENCES "MedAdministration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedAlert" ADD CONSTRAINT "MedAlert_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressNote" ADD CONSTRAINT "ProgressNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressNote" ADD CONSTRAINT "ProgressNote_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressNote" ADD CONSTRAINT "ProgressNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_careTaskId_fkey" FOREIGN KEY ("careTaskId") REFERENCES "CareTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCredential" ADD CONSTRAINT "StaffCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCredential" ADD CONSTRAINT "StaffCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialAlert" ADD CONSTRAINT "CredentialAlert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialAlert" ADD CONSTRAINT "CredentialAlert_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "StaffCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialAlert" ADD CONSTRAINT "CredentialAlert_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- =============================================================================
-- Tenant RLS (matches Nest PrismaService set_config app.tenant_id / app.bypass_rls)
-- FORCE RLS so even the table owner (postgres) must honor policies.
-- =============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Tenant',
    'User',
    'Resident',
    'FamilyResidentLink',
    'MedicationOrder',
    'MedAdministration',
    'MedAlert',
    'ProgressNote',
    'CarePlan',
    'CareTask',
    'TaskCompletion',
    'StaffCredential',
    'CredentialAlert',
    'Incident',
    'MedOrderIntake',
    'AuditLog'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

CREATE POLICY tenant_isolation_tenant ON "Tenant"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR id = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR id = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "User"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "Resident"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "FamilyResidentLink"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "MedicationOrder"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "MedAdministration"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "MedAlert"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "ProgressNote"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "CarePlan"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "CareTask"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "TaskCompletion"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "StaffCredential"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "CredentialAlert"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "Incident"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "MedOrderIntake"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY tenant_isolation ON "AuditLog"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

-- Organization is multi-home; Nest uses bypass for portfolio reads.
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_service ON "Organization"
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY refresh_token_access ON "RefreshToken"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "RefreshToken"."userId"
        AND u."tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "RefreshToken"."userId"
        AND u."tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
    )
  );

ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY password_reset_access ON "PasswordResetToken"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "PasswordResetToken"."userId"
        AND u."tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "PasswordResetToken"."userId"
        AND u."tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
    )
  );

-- Prisma migration history (so migrate deploy is a no-op after SQL apply)
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  id                  VARCHAR(36)  PRIMARY KEY,
  checksum            VARCHAR(64)  NOT NULL,
  finished_at         TIMESTAMPTZ,
  migration_name      VARCHAR(255) NOT NULL,
  logs                TEXT,
  rolled_back_at      TIMESTAMPTZ,
  started_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  applied_steps_count INTEGER      NOT NULL DEFAULT 0
);

