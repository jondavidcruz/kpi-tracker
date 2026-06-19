-- Closing: lead source, market (for avg fee by market), and fallout reason.
ALTER TABLE "Closing" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Closing" ADD COLUMN IF NOT EXISTS "market" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Closing" ADD COLUMN IF NOT EXISTS "falloutReason" TEXT NOT NULL DEFAULT '';

-- Per-channel marketing spend + email engagement (monthly team inputs for benchmarks).
INSERT INTO "Kpi" ("id","key","name","emoji","category","unit","scope","roleKey","cadence","goalValue","goalKind","computed","definition","sortOrder","active") VALUES
  ('kpi_spend_ppl','spend_ppl','PPL Spend','🎟️','green','currency','team','','monthly',NULL,'tracked',false,'Pay-per-lead spend this month.',80,true),
  ('kpi_spend_sms','spend_sms','SMS Spend','💬','green','currency','team','','monthly',NULL,'tracked',false,'SMS marketing spend this month.',81,true),
  ('kpi_spend_mail','spend_mail','Direct Mail Spend','📮','green','currency','team','','monthly',NULL,'tracked',false,'Direct mail spend this month.',82,true),
  ('kpi_email_open','email_open_rate','Email Open Rate','📧','yellow','percent','team','','monthly',NULL,'tracked',false,'Email open rate this month (from the email tool).',83,true),
  ('kpi_email_ctr','email_ctr','Email Click-Through Rate','🖱️','yellow','percent','team','','monthly',NULL,'tracked',false,'Email click-through rate this month.',84,true)
ON CONFLICT ("key") DO NOTHING;
