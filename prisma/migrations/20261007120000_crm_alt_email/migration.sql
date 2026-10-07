-- Sellers carry several emails too. Additive only.
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "altEmail" TEXT NOT NULL DEFAULT '';
