-- Sharyn had a power outage all day 2026-06-22 and was unable to work (excused).
INSERT INTO "Outage" ("id","userId","date","kind","startMin","endMin","ongoing","reportedBy","note")
SELECT 'outage_sharyn_20260622', u.id, '2026-06-22', 'power', 540, 1020, false, 'Jon', 'Power outage all day — unable to work.'
FROM "User" u WHERE u.name LIKE 'Sharyn%'
ON CONFLICT ("id") DO NOTHING;
