-- Sprint 4: MAR sheet metadata columns on MedicationOrder
ALTER TABLE "MedicationOrder" ADD COLUMN IF NOT EXISTS "brand" TEXT;
ALTER TABLE "MedicationOrder" ADD COLUMN IF NOT EXISTS "rxNumber" TEXT;
ALTER TABLE "MedicationOrder" ADD COLUMN IF NOT EXISTS "imprint" TEXT;
ALTER TABLE "MedicationOrder" ADD COLUMN IF NOT EXISTS "categoryLabel" TEXT;
ALTER TABLE "MedicationOrder" ADD COLUMN IF NOT EXISTS "prescriber" TEXT;
ALTER TABLE "MedicationOrder" ADD COLUMN IF NOT EXISTS "highAlert" BOOLEAN NOT NULL DEFAULT false;
