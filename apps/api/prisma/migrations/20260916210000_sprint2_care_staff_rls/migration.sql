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
CREATE TABLE "CarePlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goals" TEXT,
    "status" "CarePlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
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
-- CreateIndex
CREATE INDEX "FamilyResidentLink_tenantId_userId_deletedAt_idx" ON "FamilyResidentLink"("tenantId", "userId", "deletedAt");
-- CreateIndex
CREATE UNIQUE INDEX "FamilyResidentLink_tenantId_userId_residentId_key" ON "FamilyResidentLink"("tenantId", "userId", "residentId");
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
-- AddForeignKey
ALTER TABLE "FamilyResidentLink" ADD CONSTRAINT "FamilyResidentLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FamilyResidentLink" ADD CONSTRAINT "FamilyResidentLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FamilyResidentLink" ADD CONSTRAINT "FamilyResidentLink_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
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

-- Sprint 2: FORCE ROW LEVEL SECURITY on tenant-owned tables.
-- app.tenant_id is set per request transaction; app.bypass_rls='on' for auth/cron.

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
    'AuditLog'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_tenant ON %I', t);
  END LOOP;
END $$;

-- Tenant table: match by id
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

CREATE POLICY tenant_isolation ON "AuditLog"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

-- RefreshToken has no tenantId; scoped via user join. Allow when bypass or owning user in tenant.
ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refresh_token_access ON "RefreshToken";
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
