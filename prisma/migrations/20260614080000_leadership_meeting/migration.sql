-- Leadership Meeting deck content + per-meeting note logs
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "leadAgenda" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "leadActionItems" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MeetingNote" ADD COLUMN IF NOT EXISTS "meeting" TEXT NOT NULL DEFAULT 'monday';
CREATE INDEX IF NOT EXISTS "MeetingNote_meeting_createdAt_idx" ON "MeetingNote"("meeting","createdAt");
