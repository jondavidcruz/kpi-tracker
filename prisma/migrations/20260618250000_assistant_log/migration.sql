-- Audit trail of Cortana assistant questions (insider-threat visibility).
CREATE TABLE "AssistantLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "path" TEXT NOT NULL DEFAULT '',
    "question" TEXT NOT NULL DEFAULT '',
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssistantLog_createdAt_idx" ON "AssistantLog"("createdAt");
