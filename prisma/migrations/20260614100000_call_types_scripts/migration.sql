-- Call type selection + per-type script store for call scoring
ALTER TABLE "CallScore" ADD COLUMN IF NOT EXISTS "callType" TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS "CallScript" (
    "id" TEXT NOT NULL,
    "callType" TEXT NOT NULL,
    "script" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallScript_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CallScript_callType_key" ON "CallScript"("callType");
