-- Multiple links per developer/buyer (website, LinkedIn, IG, …), one per line.
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "links" TEXT NOT NULL DEFAULT '';
-- Seed the new field with the existing single website so nothing is lost.
UPDATE "MarketContact" SET "links" = "website" WHERE "links" = '' AND "website" <> '';
