-- Add "Lead Refunds Rejected" next to Lead Refunds Requested/Approved (Jon 2026-07-06).
-- Team KPI, manually entered (Marie). DATA-ONLY — a new Kpi row, no schema change.
INSERT INTO "Kpi" ("id","key","name","emoji","category","unit","scope","roleKey","cadence","goalValue","goalKind","computed","definition","sortOrder","active") VALUES
  ('kpi_ppl_refund_rej','ppl_refund_rejected','Lead Refunds Rejected','🚫','yellow','count','team','','daily',NULL,'tracked',false,'PPL lead refund requests the provider denied (we asked for a refund and did not get it).',51,true)
ON CONFLICT ("key") DO NOTHING;
