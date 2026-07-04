-- In-house behavioral assessment (DISC-based). One row per invited person; JSON results.
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "workStylesResult" TEXT NOT NULL DEFAULT '',
    "wordSurveyResult" TEXT NOT NULL DEFAULT '',
    "profileKey" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Assessment_token_key" ON "Assessment"("token");
CREATE INDEX "Assessment_createdAt_idx" ON "Assessment"("createdAt");
