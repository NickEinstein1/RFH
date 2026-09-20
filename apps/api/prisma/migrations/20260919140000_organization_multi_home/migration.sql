-- Multi-home ownership: organizations group facilities for one-login switch
CREATE TABLE IF NOT EXISTS "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

CREATE INDEX IF NOT EXISTS "Tenant_organizationId_idx" ON "Tenant"("organizationId");

DO $$ BEGIN
  ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
