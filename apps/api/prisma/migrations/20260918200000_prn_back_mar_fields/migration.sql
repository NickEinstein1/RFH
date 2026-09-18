-- Back-of-MAR PRN administration fields
ALTER TABLE "MedAdministration" ADD COLUMN IF NOT EXISTS "prnRouteSite" TEXT;
ALTER TABLE "MedAdministration" ADD COLUMN IF NOT EXISTS "prnReason" TEXT;
ALTER TABLE "MedAdministration" ADD COLUMN IF NOT EXISTS "prnBmi" TEXT;
ALTER TABLE "MedAdministration" ADD COLUMN IF NOT EXISTS "prnBmiOther" TEXT;
ALTER TABLE "MedAdministration" ADD COLUMN IF NOT EXISTS "prnResult" TEXT;
ALTER TABLE "MedAdministration" ADD COLUMN IF NOT EXISTS "prnMse" TEXT;
ALTER TABLE "MedAdministration" ADD COLUMN IF NOT EXISTS "prnMseOther" TEXT;
ALTER TABLE "MedAdministration" ADD COLUMN IF NOT EXISTS "prnPainScore" INTEGER;
