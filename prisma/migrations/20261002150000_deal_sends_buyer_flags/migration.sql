-- Phase 7 (BUILD_SPEC_2): deal sends + buyer feedback flags. Additive only.
CREATE TABLE IF NOT EXISTS "DealSend" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "wave" INTEGER NOT NULL DEFAULT 1,
    "packetUrl" TEXT NOT NULL DEFAULT '',
    "floorPrice" DOUBLE PRECISION,
    "askPrice" DOUBLE PRECISION,
    "respondedAt" TIMESTAMP(3),
    "outcome" TEXT NOT NULL DEFAULT '',
    "offerAmount" DOUBLE PRECISION,
    "passReason" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "actor" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "DealSend_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DealSend_buyerId_sentAt_idx" ON "DealSend"("buyerId", "sentAt");
CREATE INDEX IF NOT EXISTS "DealSend_dealId_idx" ON "DealSend"("dealId");
ALTER TABLE "DealSend" DROP CONSTRAINT IF EXISTS "DealSend_buyerId_fkey";
ALTER TABLE "DealSend" ADD CONSTRAINT "DealSend_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "MarketContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "buyerFlags" JSONB;
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "blacklistedAt" TIMESTAMP(3);
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "blacklistReason" TEXT;
