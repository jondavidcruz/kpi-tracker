-- Vetted-buyers rebuild Phase 1 (BUILD_SPEC 2026-09-23). ADDITIVE ONLY:
-- archive columns + structured buy box + geo on MarketContact, plus the
-- BuyerHistory / BuyerContact / BuyerTouch tables. No drops, no data changes.
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "archivedBy" TEXT;
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "archiveReason" TEXT;
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "buyBoxStruct" JSONB;
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "buyBoxUpdatedAt" TIMESTAMP(3);
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "buyBoxSource" TEXT;
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "geoPolygon" JSONB;
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "geoCentroidLat" DOUBLE PRECISION;
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "geoCentroidLng" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "BuyerHistory" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "before" JSONB,
    "after" JSONB,
    CONSTRAINT "BuyerHistory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BuyerHistory_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "MarketContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "BuyerHistory_buyerId_at_idx" ON "BuyerHistory"("buyerId", "at");

CREATE TABLE IF NOT EXISTS "BuyerContact" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "BuyerContact_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BuyerContact_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "MarketContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "BuyerTouch" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT,
    "outcome" TEXT,
    "note" TEXT,
    "actor" TEXT,
    CONSTRAINT "BuyerTouch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BuyerTouch_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "MarketContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "BuyerTouch_buyerId_at_idx" ON "BuyerTouch"("buyerId", "at");
