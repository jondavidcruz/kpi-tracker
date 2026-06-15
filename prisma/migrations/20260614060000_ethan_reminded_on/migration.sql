-- Dedupe flag so Ethan only gets one shift-end reminder per day (across cron runs)
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "ethanRemindedOn" TEXT NOT NULL DEFAULT '';
