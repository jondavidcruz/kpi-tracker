-- Rename "Total Talk Time" -> "CRM Talk Time" and place the talk-time KPIs at the
-- end of each scorecard, side by side (high sortOrder; others are well below).
UPDATE "Kpi" SET
  "name" = 'CRM Talk Time',
  "definition" = 'Talk time logged in the CRM with sellers.',
  "sortOrder" = 900
WHERE "key" = 'acq_talk_time';

UPDATE "Kpi" SET "sortOrder" = 901 WHERE "key" = 'acq_dialer_talk_time';
UPDATE "Kpi" SET "sortOrder" = 900 WHERE "key" = 'ds_dialer_talk_time';
