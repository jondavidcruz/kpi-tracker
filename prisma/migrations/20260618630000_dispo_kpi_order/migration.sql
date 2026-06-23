-- New auto effort KPI: total answered calls (from CRM, any duration).
INSERT INTO "Kpi" ("id","key","name","emoji","category","unit","scope","roleKey","cadence","goalValue","goalKind","computed","definition","sortOrder","active") VALUES
  ('kpi_ds_answered','answered_calls','Answered Calls','📞','blue','count','per_rep','dispositions','daily',NULL,'tracked',false,'Calls that actually connected (any length) — from the CRM. Gap vs Conversations = quick hang-ups/voicemails.',33,true)
ON CONFLICT ("key") DO NOTHING;

-- Rename to match the team's wording.
UPDATE "Kpi" SET "name" = 'Fix/Flipper Conversations' WHERE "key" = 'buyer_conversations';

-- MONEY — results, in workflow order.
UPDATE "Kpi" SET "sortOrder" = 10 WHERE "key" = 'buyer_conversations';
UPDATE "Kpi" SET "sortOrder" = 11 WHERE "key" = 'dev_conversations';
UPDATE "Kpi" SET "sortOrder" = 12 WHERE "key" = 'buyers_vetted';
UPDATE "Kpi" SET "sortOrder" = 13 WHERE "key" = 'buy_boxes_captured';
UPDATE "Kpi" SET "sortOrder" = 14 WHERE "key" = 'new_buyers';
UPDATE "Kpi" SET "sortOrder" = 15 WHERE "key" = 'deals_sold';
UPDATE "Kpi" SET "sortOrder" = 16 WHERE "key" = 'buyer_offers_received';
UPDATE "Kpi" SET "sortOrder" = 17 WHERE "key" = 'contracts_assigned';
UPDATE "Kpi" SET "sortOrder" = 18 WHERE "key" = 'deals_comped';

-- ACTIVITY — call effort first, then sourcing channels.
UPDATE "Kpi" SET "sortOrder" = 30 WHERE "key" = 'ds_talk_time';
UPDATE "Kpi" SET "sortOrder" = 31 WHERE "key" = 'ds_dialer_talk_time';
UPDATE "Kpi" SET "sortOrder" = 32 WHERE "key" = 'buyers_contacted';
UPDATE "Kpi" SET "sortOrder" = 33 WHERE "key" = 'answered_calls';
UPDATE "Kpi" SET "sortOrder" = 34 WHERE "key" = 'developers_contacted';
UPDATE "Kpi" SET "sortOrder" = 35 WHERE "key" = 'dev_instagram';
UPDATE "Kpi" SET "sortOrder" = 36 WHERE "key" = 'dev_linkedin';
UPDATE "Kpi" SET "sortOrder" = 37 WHERE "key" = 'dev_website';
UPDATE "Kpi" SET "sortOrder" = 38 WHERE "key" = 'avg_days_to_sell';
