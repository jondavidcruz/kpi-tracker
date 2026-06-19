-- Google Meet link for the daily 9am huddle (Freedom Offers Office).
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "huddleMeetLink" TEXT NOT NULL DEFAULT '';
UPDATE "Settings" SET "huddleMeetLink" = 'https://meet.google.com/hga-ckue-ecy' WHERE "id" = 1 AND "huddleMeetLink" = '';
