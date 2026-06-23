ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "vetStatus" TEXT NOT NULL DEFAULT 'to_contact';
-- Imported prospects that already had outreach logged → mark 'contacted'.
UPDATE "MarketContact" SET "vetStatus" = 'contacted'
WHERE "vetStage" = 'to_vet' AND ("outreachLog" <> '' OR "lastContacted" <> '');
