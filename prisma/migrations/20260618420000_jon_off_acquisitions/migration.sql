-- Take Jon (owner) off the acquisitions scorecard; he is excluded from KPI reports.
UPDATE "User" SET "position" = '' WHERE "role" = 'admin' AND "name" LIKE 'Jon%';
