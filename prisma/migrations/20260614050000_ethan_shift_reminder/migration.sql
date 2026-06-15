-- Shift-aware EOD KPI reminder for Ethan (irregular schedule, calendar-driven)
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "ethanShiftIcsUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "ethanReminderEmail" TEXT NOT NULL DEFAULT '';
INSERT INTO "Settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
UPDATE "Settings" SET "ethanReminderEmail" = 'delacruzsellshomes@gmail.com'
WHERE "id" = 1 AND "ethanReminderEmail" = '';
