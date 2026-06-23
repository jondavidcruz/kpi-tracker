-- We don't track Deals Under Contract as a KPI.
UPDATE "Kpi" SET "active" = false WHERE "key" = 'deals_under_contract';
