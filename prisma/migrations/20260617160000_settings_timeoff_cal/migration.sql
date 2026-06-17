-- SA-owned Time Off calendar id (auto-provisioned on first approval).
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "timeoffCalendarId" TEXT NOT NULL DEFAULT '';
