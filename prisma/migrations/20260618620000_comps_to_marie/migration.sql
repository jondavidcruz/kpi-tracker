-- Comps belong to Marie (dispo). Use the existing "deals_comped" KPI and retire the
-- acquisitions Comps KPI added earlier.
UPDATE "Kpi" SET "active" = false WHERE "key" = 'comps_done';
-- Make sure Deals Comped is a scored (green) goal-bearing KPI for dispo.
UPDATE "Kpi" SET "category" = 'green', "goalKind" = 'at_least', "goalValue" = COALESCE("goalValue", 2),
  "definition" = 'Deals you comped — auto-verified when Michelle moves a lead to COMP REVIEW in the AQ pipeline.'
  WHERE "key" = 'deals_comped';
