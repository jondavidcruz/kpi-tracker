ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "phone2" TEXT NOT NULL DEFAULT '';
-- Split imported "p1 / p2" phone strings into the two Number columns.
UPDATE "MarketContact"
  SET "phone2" = trim(substring("phone" from position(' / ' in "phone") + 3))
  WHERE "phone" LIKE '% / %' AND "phone2" = '';
UPDATE "MarketContact"
  SET "phone" = trim(substring("phone" from 1 for position(' / ' in "phone") - 1))
  WHERE "phone" LIKE '% / %';
