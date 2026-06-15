-- Change/Improvement Portal + AI Champion
CREATE TABLE IF NOT EXISTS "ChangeRequest" (
    "id" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "submitterEmail" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'other',
    "status" TEXT NOT NULL DEFAULT 'open',
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ChangeRequest_status_idx" ON "ChangeRequest"("status");

CREATE TABLE IF NOT EXISTS "ChangeComment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "byLeadership" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChangeComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ChangeComment_requestId_idx" ON "ChangeComment"("requestId");
DO $$ BEGIN
  ALTER TABLE "ChangeComment" ADD CONSTRAINT "ChangeComment_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "ChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AiSubmission" (
    "id" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "submitterEmail" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "tool" TEXT NOT NULL DEFAULT '',
    "hoursSaved" DOUBLE PRECISION,
    "proofUrl" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "rewardAmount" DOUBLE PRECISION,
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiSubmission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiSubmission_status_idx" ON "AiSubmission"("status");
