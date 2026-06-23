-- Jon is full-time on acquisitions again to own the closing problem.
-- Reverses 20260618420000_jon_off_acquisitions — back on the scorecard, reports,
-- and the Monday KPI email.
UPDATE "User" SET "position" = 'acquisitions' WHERE "role" = 'admin' AND "name" LIKE 'Jon%';
