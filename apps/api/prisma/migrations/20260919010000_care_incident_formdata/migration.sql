-- Negotiated Care Plan + CBHS Incident template payloads
ALTER TABLE "CarePlan" ADD COLUMN IF NOT EXISTS "formData" JSONB;
ALTER TABLE "Incident" ADD COLUMN IF NOT EXISTS "formData" JSONB;
