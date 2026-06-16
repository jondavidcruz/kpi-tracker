-- Encrypted password on Software + access audit log
ALTER TABLE "Software" ADD COLUMN IF NOT EXISTS "secret" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "SecretAccess" (
    "id" TEXT NOT NULL,
    "softwareId" TEXT NOT NULL,
    "softwareName" TEXT NOT NULL DEFAULT '',
    "viewedBy" TEXT NOT NULL DEFAULT '',
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecretAccess_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SecretAccess_viewedAt_idx" ON "SecretAccess"("viewedAt");
