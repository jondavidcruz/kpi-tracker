-- Culture: birthdays + work anniversaries (on User) and team-building events.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthday" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hireDate" TEXT;

CREATE TABLE IF NOT EXISTS "TeamEvent" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'team_building',
  "notes" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TeamEvent_date_idx" ON "TeamEvent"("date");
ALTER TABLE IF EXISTS "TeamEvent" ENABLE ROW LEVEL SECURITY;
