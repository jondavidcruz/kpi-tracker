-- End-of-day fields on the huddle stand-up (hit/partial/miss + follow-ups for tomorrow).
ALTER TABLE "Standup" ADD COLUMN IF NOT EXISTS "eodHit" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Standup" ADD COLUMN IF NOT EXISTS "eodNote" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Standup" ADD COLUMN IF NOT EXISTS "eodFollowup" TEXT NOT NULL DEFAULT '';
