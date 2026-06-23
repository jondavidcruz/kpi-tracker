-- Call-audit Google Chat space (scored calls post here, not the KPI space).
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "callAuditChatWebhook" TEXT NOT NULL DEFAULT '';
UPDATE "Settings" SET "callAuditChatWebhook" =
  'https://chat.googleapis.com/v1/spaces/AAQAZSlcSi4/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=xolnK29-eneYtnNjpfOJzqttIAeANiwZgs2okwS8LdY'
  WHERE "callAuditChatWebhook" = '';

-- Touch attribution for the auto "Developers Contacted" KPI.
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "touchById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "touchOn"   TEXT NOT NULL DEFAULT '';

-- Remove Word-of-Mouth Intros from the dispo scorecard.
UPDATE "Kpi" SET "active" = false WHERE "key" = 'dev_wordofmouth';

-- New auto effort KPI: developers/buyers contacted today (from Buyer Research touches).
INSERT INTO "Kpi" ("id","key","name","emoji","category","unit","scope","roleKey","cadence","goalValue","goalKind","computed","definition","sortOrder","active") VALUES
  ('kpi_ds_devcontact','developers_contacted','Developers Contacted','📇','blue','count','per_rep','dispositions','daily',5,'at_least',false,'Developers/buyers you logged a touch on today in Buyer Research (auto).',96,true)
ON CONFLICT ("key") DO NOTHING;
