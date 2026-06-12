-- Alert resolution + accountability fields (idempotent: safe if columns already exist)
ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "repReason" TEXT;
ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "resolutionCategory" TEXT;
ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "resolutionNote" TEXT;
ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "correctiveAction" TEXT;
ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "resolvedBy" TEXT;
ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "excused" BOOLEAN NOT NULL DEFAULT false;
