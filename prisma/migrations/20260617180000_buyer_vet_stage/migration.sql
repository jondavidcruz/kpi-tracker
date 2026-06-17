-- Buyer vetting workflow stage.
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "vetStage" TEXT NOT NULL DEFAULT 'to_vet';
