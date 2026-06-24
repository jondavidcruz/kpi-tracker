-- No setter — appointments aren't a tracked metric.
UPDATE "Kpi" SET "active" = false WHERE "key" IN ('appts_set', 'appts_taken');

-- Calibrate per-rep DAILY goals to shift hours:
--   Michelle & Sharyn = 8h Mon–Thu + 5h Fri; Marie = 5h Mon–Fri.
-- Standing per-rep overrides (period NULL). Clear theirs first so this is idempotent.
DELETE FROM "Target" WHERE "period" IS NULL AND "userId" IN
  (SELECT id FROM "User" WHERE name LIKE 'Michelle%' OR name LIKE 'Sharyn%' OR name LIKE 'Marie%');

INSERT INTO "Target" ("id", "kpiId", "userId", "period", "goalValue")
SELECT gen_random_uuid()::text, k.id, u.id, NULL, g.goal
FROM (VALUES
  -- Sharyn (dispo, 8h, developer-sourcing focus)
  ('Sharyn','developers_contacted',10),
  ('Sharyn','dev_conversations',2),
  ('Sharyn','new_buyers',3),
  ('Sharyn','buy_boxes_captured',2),
  ('Sharyn','buyers_vetted',1),
  ('Sharyn','buyer_conversations',1),
  ('Sharyn','deals_sold',1),
  -- Marie (dispo, 5h, buyer focus + comps)
  ('Marie','developers_contacted',5),
  ('Marie','dev_conversations',1),
  ('Marie','buyer_conversations',3),
  ('Marie','new_buyers',2),
  ('Marie','buy_boxes_captured',1),
  ('Marie','buyers_vetted',1),
  ('Marie','deals_comped',2),
  ('Marie','deals_sold',1),
  ('Marie','dev_instagram',5),
  ('Marie','dev_linkedin',4),
  ('Marie','dev_website',3),
  -- Michelle (acq, 8h)
  ('Michelle','offers_made',2),
  ('Michelle','completed_process_calls',3)
) AS g(first, key, goal)
JOIN "User" u ON u.name LIKE g.first || '%'
JOIN "Kpi"  k ON k.key = g.key;
