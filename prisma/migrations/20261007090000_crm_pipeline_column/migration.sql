-- Multi-pipeline CRM (GHL parity). Additive only.
ALTER TABLE "CrmOpportunity" ADD COLUMN IF NOT EXISTS "pipeline" TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "CrmOpportunity_pipeline_stage_idx" ON "CrmOpportunity"("pipeline", "stage");
