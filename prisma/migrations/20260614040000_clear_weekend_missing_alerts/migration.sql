-- No one works weekends. Remove any stale missing-entry alerts dated on a
-- Saturday/Sunday (date stored as 'YYYY-MM-DD'; DOW 0=Sun, 6=Sat).
DELETE FROM "Alert"
WHERE EXTRACT(DOW FROM ("date")::date) IN (0, 6)
  AND "actual" = 0
  AND "message" LIKE '%hasn''t logged%';
