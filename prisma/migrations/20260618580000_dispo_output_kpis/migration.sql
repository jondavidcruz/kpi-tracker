-- Attribution columns for auto-tracked Buyer Research KPIs.
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "addedById"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "addedOn"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "boxById"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "boxOn"      TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "vettedById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "vettedOn"   TEXT NOT NULL DEFAULT '';

-- New OUTPUT KPIs for dispositions — auto-filled from Buyer Research (not self-reported).
INSERT INTO "Kpi" ("id","key","name","emoji","category","unit","scope","roleKey","cadence","goalValue","goalKind","computed","definition","sortOrder","active") VALUES
  ('kpi_ds_boxes','buy_boxes_captured','Buy Boxes Captured','📋','green','count','per_rep','dispositions','daily',2,'at_least',false,'Buyers/developers whose buy box you captured (auto from Buyer Research).',48,true),
  ('kpi_ds_vetted','buyers_vetted','Buyers Vetted','✅','green','count','per_rep','dispositions','daily',1,'at_least',false,'Buyers/developers you moved to Vetted (auto from Buyer Research).',49,true),
  ('kpi_ds_buyerconv','buyer_conversations','Buyer Conversations','🗣️','green','count','per_rep','dispositions','daily',5,'at_least',false,'Real 2-way conversations with fix/flip & cash buyers (CRM-tracked).',95,true)
ON CONFLICT ("key") DO NOTHING;

-- Developer Conversations is a RESULT, not activity → make it a scored (green) KPI.
UPDATE "Kpi" SET "category" = 'green' WHERE "key" = 'dev_conversations';

-- "New Buyers Added" is now auto-tracked output → keep it scored, refresh the definition.
UPDATE "Kpi" SET "category" = 'green', "definition" = 'Net-new buyers/developers you added (auto from Buyer Research).'
  WHERE "key" = 'new_buyers';

-- Dials/voicemails are effort, not output → demote "Buyers Contacted" to context-only.
UPDATE "Kpi" SET "category" = 'blue', "goalValue" = NULL, "goalKind" = 'tracked',
  "name" = 'Dials / Attempts', "definition" = 'Call attempts incl. voicemails — context only, not a goal. Conversations are what count.'
  WHERE "key" = 'buyers_contacted';
