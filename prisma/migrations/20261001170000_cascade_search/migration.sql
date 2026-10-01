-- CascadeSearch (vetted-buyers rebuild Phase 3) — additive, isolated table.
CREATE TABLE IF NOT EXISTS "CascadeSearch" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL,
    "geocode" JSONB,
    "price" DOUBLE PRECISION,
    "acres" DOUBLE PRECISION,
    "assetType" TEXT NOT NULL DEFAULT '',
    "topIds" JSONB,
    CONSTRAINT "CascadeSearch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CascadeSearch_at_idx" ON "CascadeSearch"("at");
