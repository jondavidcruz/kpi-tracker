-- Ethan -> listings only. Remove him from the KPI scorecards (clear his
-- position) and stop internet tracking, but KEEP his login and all history so
-- it can be restored. When he goes full-time, set position back to 'acquisitions'.
UPDATE "User"
SET "position" = '', "tracksInternet" = false
WHERE "name" ILIKE 'Ethan%';

-- Turn off the shift-aware KPI-reminder email for Ethan entirely.
UPDATE "Settings" SET "ethanShiftIcsUrl" = '', "ethanReminderEmail" = '' WHERE "id" = 1;
