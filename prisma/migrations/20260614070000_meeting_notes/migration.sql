-- Meeting feedback notes
CREATE TABLE IF NOT EXISTS "MeetingNote" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MeetingNote_createdAt_idx" ON "MeetingNote"("createdAt");
