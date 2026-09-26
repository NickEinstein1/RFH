-- Fax + multi-pharmacy integrations
CREATE TYPE "FaxJobStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "PharmacyNetwork" AS ENUM ('MANUAL_FAX', 'LINCOLN', 'READY_MEDS', 'CVS', 'WALGREENS', 'PIONEER_RX', 'QS1', 'SURESCRIPTS', 'OTHER');
CREATE TYPE "TransmitStatus" AS ENUM ('DRAFT', 'FAX_QUEUED', 'FAX_SENT', 'ERX_SUBMITTED', 'FAILED');

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "pharmacyName" TEXT,
  ADD COLUMN IF NOT EXISTS "pharmacyPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "pharmacyFax" TEXT,
  ADD COLUMN IF NOT EXISTS "pharmacyNpi" TEXT,
  ADD COLUMN IF NOT EXISTS "facilityFax" TEXT,
  ADD COLUMN IF NOT EXISTS "faxEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MedicationOrder"
  ADD COLUMN IF NOT EXISTS "pharmacyConnectionId" TEXT,
  ADD COLUMN IF NOT EXISTS "transmitStatus" "TransmitStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "lastTransmittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pharmacyNpi" TEXT,
  ADD COLUMN IF NOT EXISTS "pharmacyFax" TEXT;

CREATE TABLE IF NOT EXISTS "PharmacyConnection" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "network" "PharmacyNetwork" NOT NULL DEFAULT 'MANUAL_FAX',
  "displayName" TEXT NOT NULL,
  "npi" TEXT,
  "phone" TEXT,
  "fax" TEXT,
  "apiBaseUrl" TEXT,
  "credentialsEnc" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "settings" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FaxJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "toFaxNumber" TEXT NOT NULL,
  "fromFaxNumber" TEXT,
  "subject" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "documentId" TEXT,
  "medicationOrderId" TEXT,
  "status" "FaxJobStatus" NOT NULL DEFAULT 'QUEUED',
  "provider" TEXT NOT NULL DEFAULT 'noop',
  "providerJobId" TEXT,
  "errorMessage" TEXT,
  "pageCount" INTEGER,
  "coverNote" TEXT,
  "mediaPath" TEXT,
  "sentAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FaxJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PharmacyConnection_tenantId_isActive_deletedAt_idx" ON "PharmacyConnection"("tenantId", "isActive", "deletedAt");
CREATE INDEX IF NOT EXISTS "PharmacyConnection_tenantId_network_idx" ON "PharmacyConnection"("tenantId", "network");
CREATE INDEX IF NOT EXISTS "FaxJob_tenantId_status_createdAt_idx" ON "FaxJob"("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "FaxJob_tenantId_documentType_documentId_idx" ON "FaxJob"("tenantId", "documentType", "documentId");
CREATE INDEX IF NOT EXISTS "FaxJob_medicationOrderId_idx" ON "FaxJob"("medicationOrderId");
CREATE INDEX IF NOT EXISTS "MedicationOrder_tenantId_pharmacyConnectionId_idx" ON "MedicationOrder"("tenantId", "pharmacyConnectionId");
CREATE INDEX IF NOT EXISTS "MedicationOrder_tenantId_transmitStatus_idx" ON "MedicationOrder"("tenantId", "transmitStatus");

DO $$ BEGIN
  ALTER TABLE "PharmacyConnection" ADD CONSTRAINT "PharmacyConnection_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FaxJob" ADD CONSTRAINT "FaxJob_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FaxJob" ADD CONSTRAINT "FaxJob_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FaxJob" ADD CONSTRAINT "FaxJob_medicationOrderId_fkey"
    FOREIGN KEY ("medicationOrderId") REFERENCES "MedicationOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MedicationOrder" ADD CONSTRAINT "MedicationOrder_pharmacyConnectionId_fkey"
    FOREIGN KEY ("pharmacyConnectionId") REFERENCES "PharmacyConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
