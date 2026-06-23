-- Dropping Batch Dialer — remove the separate "Dialer Talk Time" KPIs. Talk time
-- now lives solely in "CRM Talk Time" (auto from REI Reply).
UPDATE "Kpi" SET "active" = false WHERE "key" IN ('acq_dialer_talk_time', 'ds_dialer_talk_time');

-- Only one talk-time KPI now — simplify the name.
UPDATE "Kpi" SET "name" = 'Talk Time' WHERE "key" IN ('acq_talk_time', 'ds_talk_time');
