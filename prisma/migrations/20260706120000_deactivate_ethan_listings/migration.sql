-- Jon 2026-07-06: fully deactivate Ethan and retire the Listings scorecard.
-- Ethan no longer uses the War Room and listings are not actively worked.
-- DATA-ONLY (no schema change) → cannot cause a schema/code mismatch. Reversible in Admin.

-- Ethan: remove from every active-filtered surface (login, dashboards, roster, alerts).
UPDATE "User" SET "active" = false WHERE "name" ILIKE 'ethan%';

-- Listings KPI(s): stop tracking. Entries are preserved (active=false only hides them).
UPDATE "Kpi" SET "active" = false WHERE "roleKey" = 'listings' OR "key" ILIKE 'listing%';
