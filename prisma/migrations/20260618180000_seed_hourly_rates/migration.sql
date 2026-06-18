-- Pre-load hourly rates from the Paycheck Report 2026.xlsx (Jon confirmed
-- 2026-06-18). One-time data migration; editable afterward in the roster.
UPDATE "TeamProfile" SET "payScale" = '$5.00/hr', "payPeriod" = 'hourly' WHERE lower("name") LIKE 'marie%';
UPDATE "TeamProfile" SET "payScale" = '$3.00/hr', "payPeriod" = 'hourly' WHERE lower("name") LIKE 'sharyn%';
UPDATE "TeamProfile" SET "payScale" = '$3.00/hr', "payPeriod" = 'hourly' WHERE lower("name") LIKE 'michelle%';
