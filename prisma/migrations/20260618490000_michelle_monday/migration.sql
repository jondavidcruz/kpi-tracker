-- Michelle also trains Monday at 11:30 AM (Tue–Fri stays 12:30). All sessions are 30 min.
INSERT INTO "TrainingSchedule" ("id","userId","cadence","time","focus")
SELECT 'ts_mich_mon', u.id, 'mon', '11:30 AM', 'Call review + live coaching — rapport & closing'
FROM "User" u
WHERE u.name LIKE 'Michelle%'
  AND NOT EXISTS (SELECT 1 FROM "TrainingSchedule" t WHERE t."id" = 'ts_mich_mon');
