-- Inbound/outbound on scored calls + company size on buyers.
ALTER TABLE "CallScore" ADD COLUMN "direction" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketContact" ADD COLUMN "companySize" TEXT NOT NULL DEFAULT '';
