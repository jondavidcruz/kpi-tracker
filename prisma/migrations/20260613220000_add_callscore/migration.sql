-- AI call scoring (idempotent)
CREATE TABLE IF NOT EXISTS "CallScore" (
    "id" TEXT NOT NULL,
    "repName" TEXT NOT NULL DEFAULT '',
    "scoredBy" TEXT NOT NULL DEFAULT '',
    "overall" INTEGER NOT NULL DEFAULT 0,
    "breakdown" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL DEFAULT '',
    "transcript" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallScore_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CallScore_createdAt_idx" ON "CallScore"("createdAt");
