-- Ethan is part-time, listings-only, and supervised directly during his short
-- shift — exclude him from automated internet-speed reminders. (The team-wide
-- "track internet for everyone" migration had re-enabled his tracking.)
UPDATE "User" SET "tracksInternet" = false WHERE "name" ILIKE 'ethan%';
