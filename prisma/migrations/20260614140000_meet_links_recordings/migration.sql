-- Google Meet links + Fathom recordings archive
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "teamMeetLink" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "leadershipMeetLink" TEXT NOT NULL DEFAULT '';
INSERT INTO "Settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
UPDATE "Settings" SET "teamMeetLink"='https://meet.google.com/rdz-hsjf-tyf' WHERE "id"=1 AND "teamMeetLink"='';
UPDATE "Settings" SET "leadershipMeetLink"='https://meet.google.com/tgv-beci-byb' WHERE "id"=1 AND "leadershipMeetLink"='';

CREATE TABLE IF NOT EXISTS "MeetingRecording" (
    "id" TEXT NOT NULL,
    "meeting" TEXT NOT NULL DEFAULT 'monday',
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "meetingDate" TEXT NOT NULL DEFAULT '',
    "postedToChat" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingRecording_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MeetingRecording_meeting_createdAt_idx" ON "MeetingRecording"("meeting","createdAt");
