-- Marie works lighter hours — lower developer-outreach targets than Sharyn (the KPI default).
INSERT INTO "Target" ("id","kpiId","userId","period","goalValue")
SELECT v.id, v.kpi_id, u.id, NULL, v.goal
FROM (VALUES
  ('tgt_marie_dev_ig','kpi_dev_ig',5),
  ('tgt_marie_dev_li','kpi_dev_li',4),
  ('tgt_marie_dev_web','kpi_dev_web',3),
  ('tgt_marie_dev_wom','kpi_dev_wom',1),
  ('tgt_marie_dev_conv','kpi_dev_conv',1)
) AS v(id, kpi_id, goal)
CROSS JOIN (SELECT id FROM "User" WHERE name LIKE 'Marie%' ORDER BY "createdAt" LIMIT 1) u
WHERE NOT EXISTS (
  SELECT 1 FROM "Target" t WHERE t."kpiId" = v.kpi_id AND t."userId" = u.id AND t."period" IS NULL
);
