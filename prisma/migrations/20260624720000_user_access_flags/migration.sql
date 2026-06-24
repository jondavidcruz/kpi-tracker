-- Editable per-user access toggles. Backfill to the current intended access so nobody
-- loses or gains access on deploy. Marie is intentionally OFF for C-Suite + pay.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accessCsuite" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accessPayroll" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accessMarketing" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User" SET "accessCsuite"    = true WHERE lower(split_part("name", ' ', 1)) IN ('jon', 'enrico', 'viktoriia');
UPDATE "User" SET "accessPayroll"   = true WHERE lower(split_part("name", ' ', 1)) IN ('jon', 'enrico', 'viktoriia');
UPDATE "User" SET "accessMarketing" = true WHERE lower(split_part("name", ' ', 1)) IN ('jon', 'marie', 'sharyn', 'viktoriia');
