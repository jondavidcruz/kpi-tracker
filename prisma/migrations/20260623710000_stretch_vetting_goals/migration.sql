-- Stretch Buyers Vetted for Marie + Sharyn — 1/day was too easy for a full shift.
-- Sharyn (8h) -> 4/day, Marie (5h) -> 3/day. Standing per-rep overrides (period NULL).
DELETE FROM "Target" WHERE "period" IS NULL AND ("kpiId", "userId") IN (
  SELECT k.id, u.id FROM "Kpi" k, "User" u
  WHERE k.key = 'buyers_vetted' AND (u.name LIKE 'Sharyn%' OR u.name LIKE 'Marie%')
);

INSERT INTO "Target" ("id", "kpiId", "userId", "period", "goalValue")
SELECT gen_random_uuid()::text, k.id, u.id, NULL, g.goal
FROM (VALUES ('Sharyn', 4), ('Marie', 3)) AS g(first, goal)
JOIN "User" u ON u.name LIKE g.first || '%'
JOIN "Kpi"  k ON k.key = 'buyers_vetted';
