-- Resident profile photo (data URL or stored image reference)
ALTER TABLE "Resident" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
