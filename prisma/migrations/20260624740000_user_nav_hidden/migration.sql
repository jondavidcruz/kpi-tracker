-- Per-user hidden nav items (JSON array of hrefs). Pre-hide Marie from Monthly
-- Financials, Analytics, and Leadership Meeting per Jon's request.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "navHidden" TEXT NOT NULL DEFAULT '';
UPDATE "User" SET "navHidden" = '["/monthly","/analytics","/leadership"]'
  WHERE lower(split_part("name", ' ', 1)) = 'marie';
