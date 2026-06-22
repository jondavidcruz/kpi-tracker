-- Track PPL lead refunds so every lead that came in is accounted for.
INSERT INTO "Kpi" ("id","key","name","emoji","category","unit","scope","roleKey","cadence","goalValue","goalKind","computed","definition","sortOrder","active") VALUES
  ('kpi_ppl_refund_req','ppl_refund_requested','Lead Refunds Requested','↩️','yellow','count','team','','daily',NULL,'tracked',false,'PPL leads we requested a refund on (bad number, wrong info, etc.).',49,true),
  ('kpi_ppl_refunded','ppl_refunded','Lead Refunds Approved','✅','yellow','count','team','','daily',NULL,'tracked',false,'PPL lead refunds that were actually approved/credited.',50,true)
ON CONFLICT ("key") DO NOTHING;
