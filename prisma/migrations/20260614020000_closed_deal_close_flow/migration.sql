-- Self-serve deal-close flow: lead source, acquisition cost, HUD proof, provenance
ALTER TABLE "ClosedDeal" ADD COLUMN IF NOT EXISTS "leadSource" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClosedDeal" ADD COLUMN IF NOT EXISTS "acquisitionCost" DOUBLE PRECISION;
ALTER TABLE "ClosedDeal" ADD COLUMN IF NOT EXISTS "closedBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClosedDeal" ADD COLUMN IF NOT EXISTS "dealId" TEXT;
ALTER TABLE "ClosedDeal" ADD COLUMN IF NOT EXISTS "hudData" BYTEA;
ALTER TABLE "ClosedDeal" ADD COLUMN IF NOT EXISTS "hudName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClosedDeal" ADD COLUMN IF NOT EXISTS "hudType" TEXT NOT NULL DEFAULT '';

-- Backfill lead source on the imported deals: cold call for all, then PPL for
-- the 3 most recent closings (only touches rows not yet classified).
UPDATE "ClosedDeal" SET "leadSource" = 'cold_call' WHERE "leadSource" = '';
UPDATE "ClosedDeal" SET "leadSource" = 'ppl'
WHERE "id" IN (SELECT "id" FROM "ClosedDeal" ORDER BY "closeDate" DESC LIMIT 3);
