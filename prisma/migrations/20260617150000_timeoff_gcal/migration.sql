-- Track the Google Calendar event id created when time off is approved.
ALTER TABLE "TimeOff" ADD COLUMN IF NOT EXISTS "gcalEventId" TEXT NOT NULL DEFAULT '';
