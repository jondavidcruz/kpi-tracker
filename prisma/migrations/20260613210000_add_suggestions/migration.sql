-- AI improvement suggestions (idempotent)
CREATE TABLE IF NOT EXISTS "Suggestion" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "impact" TEXT NOT NULL DEFAULT 'med',
    "effort" TEXT NOT NULL DEFAULT 'M',
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Suggestion_status_idx" ON "Suggestion"("status");
