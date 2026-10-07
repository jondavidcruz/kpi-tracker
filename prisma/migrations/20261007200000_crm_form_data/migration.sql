-- Structured discovery forms on opportunities. Additive only.
ALTER TABLE "CrmOpportunity" ADD COLUMN IF NOT EXISTS "formData" JSONB;
