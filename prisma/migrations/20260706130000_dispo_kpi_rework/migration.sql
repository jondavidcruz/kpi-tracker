-- Dispo KPI rework (Jon 2026-07-06). DATA-ONLY (no schema change).
-- Remove two unused KPIs, rename two, add Facebook Outreach, and reorder into the
-- Money (results) + Activity (effort) grouping Jon wants.

-- 1) Remove from tracking (kept as inactive rows → hidden everywhere, history preserved).
UPDATE "Kpi" SET "active" = false WHERE "key" IN ('new_buyers', 'avg_days_to_sell');

-- 2) Renames.
UPDATE "Kpi" SET "name" = 'Flipper Conversations' WHERE "key" = 'buyer_conversations';
UPDATE "Kpi" SET "name" = 'Developer Outreach (email, SMS, call)' WHERE "key" = 'developers_contacted';

-- 3) New activity KPI — Facebook Outreach (Marie uses it in place of Instagram; the
--    per-rep swap is enforced in code so Sharyn keeps Instagram and doesn't see Facebook).
INSERT INTO "Kpi" ("id","key","name","emoji","category","unit","scope","roleKey","cadence","goalValue","goalKind","computed","definition","sortOrder","active") VALUES
  ('kpi_dev_fb','dev_facebook','Facebook Outreach','📘','blue','count','per_rep','dispositions','daily',10,'at_least',false,'Personalized outreach to developers/buyers on Facebook.',34,true)
ON CONFLICT ("key") DO NOTHING;

-- 4) Reorder — MONEY (results), in Jon's exact order.
UPDATE "Kpi" SET "sortOrder" = 10 WHERE "key" = 'buyer_conversations';    -- Flipper Conversations
UPDATE "Kpi" SET "sortOrder" = 11 WHERE "key" = 'dev_conversations';      -- Developer Conversations
UPDATE "Kpi" SET "sortOrder" = 12 WHERE "key" = 'buyers_vetted';          -- Buyers Vetted
UPDATE "Kpi" SET "sortOrder" = 13 WHERE "key" = 'buy_boxes_captured';     -- Buy Boxes Captured
UPDATE "Kpi" SET "sortOrder" = 14 WHERE "key" = 'deals_sold';             -- Deals Sent to Buyers
UPDATE "Kpi" SET "sortOrder" = 15 WHERE "key" = 'buyer_offers_received';  -- Buyer Offers Received
UPDATE "Kpi" SET "sortOrder" = 16 WHERE "key" = 'contracts_assigned';     -- Contracts Assigned

-- 5) Reorder — ACTIVITY (effort), in Jon's order; extras (dialer/word-of-mouth/comped) after.
UPDATE "Kpi" SET "sortOrder" = 30 WHERE "key" = 'ds_talk_time';           -- Talk Time
UPDATE "Kpi" SET "sortOrder" = 31 WHERE "key" = 'buyers_contacted';       -- Dials / Attempts
UPDATE "Kpi" SET "sortOrder" = 32 WHERE "key" = 'answered_calls';         -- Answered Calls
UPDATE "Kpi" SET "sortOrder" = 33 WHERE "key" = 'developers_contacted';   -- Developer Outreach
UPDATE "Kpi" SET "sortOrder" = 34 WHERE "key" IN ('dev_instagram', 'dev_facebook'); -- IG (Sharyn) / FB (Marie)
UPDATE "Kpi" SET "sortOrder" = 35 WHERE "key" = 'dev_linkedin';           -- LinkedIn Outreach
UPDATE "Kpi" SET "sortOrder" = 36 WHERE "key" = 'dev_website';            -- Website Inquiries
UPDATE "Kpi" SET "sortOrder" = 37 WHERE "key" = 'ds_dialer_talk_time';
UPDATE "Kpi" SET "sortOrder" = 38 WHERE "key" = 'dev_wordofmouth';
UPDATE "Kpi" SET "sortOrder" = 39 WHERE "key" = 'deals_comped';
UPDATE "Kpi" SET "sortOrder" = 40 WHERE "key" = 'deals_under_contract';
