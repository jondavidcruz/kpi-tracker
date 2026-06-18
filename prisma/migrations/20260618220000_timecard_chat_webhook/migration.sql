-- Separate Google Chat space for clock-in / break / lunch status posts so they
-- don't clutter the main KPI Tracker space (alerts/digests stay there).
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "timecardChatWebhook" TEXT NOT NULL DEFAULT '';
