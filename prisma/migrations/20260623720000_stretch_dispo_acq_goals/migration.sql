-- Stretch dispo + acq daily goals — push past the easy "1/day", scaled to shift hours.
-- Standing per-rep overrides (period NULL); these rows were created by the calibration
-- migration, so UPDATE in place. (buyers_vetted handled separately — left as-is.)
UPDATE "Target" t SET "goalValue" = g.goal
FROM (VALUES
  ('Sharyn', 'developers_contacted', 12),
  ('Sharyn', 'dev_conversations', 3),
  ('Sharyn', 'buyer_conversations', 2),
  ('Sharyn', 'new_buyers', 4),
  ('Sharyn', 'buy_boxes_captured', 3),
  ('Marie', 'developers_contacted', 7),
  ('Marie', 'dev_conversations', 2),
  ('Marie', 'buyer_conversations', 4),
  ('Marie', 'new_buyers', 3),
  ('Marie', 'buy_boxes_captured', 2),
  ('Michelle', 'offers_made', 3)
) AS g(first, key, goal)
JOIN "User" u ON u.name LIKE g.first || '%'
JOIN "Kpi"  k ON k.key = g.key
WHERE t."userId" = u.id AND t."kpiId" = k.id AND t."period" IS NULL;
