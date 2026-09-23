-- CreateEnum
CREATE TYPE "MedOrderIntakeStatus" AS ENUM ('UPLOADED', 'EXTRACTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

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

-- AlterTable
ALTER TABLE "MedicationOrder" ADD COLUMN "intakeId" TEXT;

-- CreateIndex
CREATE INDEX "MedOrderIntake_tenantId_residentId_status_idx" ON "MedOrderIntake"("tenantId", "residentId", "status");

-- CreateIndex
CREATE INDEX "MedOrderIntake_tenantId_createdAt_idx" ON "MedOrderIntake"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "MedicationOrder_intakeId_idx" ON "MedicationOrder"("intakeId");

-- AddForeignKey
ALTER TABLE "MedOrderIntake" ADD CONSTRAINT "MedOrderIntake_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedOrderIntake" ADD CONSTRAINT "MedOrderIntake_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedOrderIntake" ADD CONSTRAINT "MedOrderIntake_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedOrderIntake" ADD CONSTRAINT "MedOrderIntake_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationOrder" ADD CONSTRAINT "MedicationOrder_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "MedOrderIntake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS
ALTER TABLE "MedOrderIntake" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MedOrderIntake" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "MedOrderIntake"
  AS PERMISSIVE FOR ALL TO PUBLIC
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
