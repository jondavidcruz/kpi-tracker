-- Phase 8 (BUILD_SPEC_2): offering packets + diligence API cache. Additive only.
CREATE TABLE IF NOT EXISTS "DealPacket" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "htmlUrl" TEXT NOT NULL DEFAULT '',
    "model" JSONB NOT NULL,
    "generatedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "DealPacket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DealPacket_dealId_version_idx" ON "DealPacket"("dealId", "version");
CREATE TABLE IF NOT EXISTS "DiligenceCache" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiligenceCache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DiligenceCache_key_key" ON "DiligenceCache"("key");
