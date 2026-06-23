-- Merge Michelle's two training sessions into ONE entry.
-- The full schedule lives in "cadence" (rendered verbatim), time left blank.
DELETE FROM "TrainingSchedule"
WHERE "userId" IN (SELECT id FROM "User" WHERE name LIKE 'Michelle%');

INSERT INTO "TrainingSchedule" ("id","userId","cadence","time","focus")
SELECT 'ts_mich_all', u.id, 'Mon 11:30 AM · Tue–Fri 12:30 PM', '', 'Call review + live coaching — rapport & closing'
FROM "User" u WHERE u.name LIKE 'Michelle%'
ON CONFLICT (id) DO NOTHING;
