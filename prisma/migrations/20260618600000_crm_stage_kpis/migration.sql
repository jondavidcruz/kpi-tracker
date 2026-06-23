-- New auto-from-CRM KPIs fed by pipeline stages.
INSERT INTO "Kpi" ("id","key","name","emoji","category","unit","scope","roleKey","cadence","goalValue","goalKind","computed","definition","sortOrder","active") VALUES
  ('kpi_aq_comps','comps_done','Comps Done','🧮','green','count','per_rep','acquisitions','daily',NULL,'tracked',false,'Deals comped — auto from the CRM Comp Review stage.',34,true),
  ('kpi_aq_signed','contracts_signed','Contracts Signed','📝','green','count','per_rep','acquisitions','daily',NULL,'tracked',false,'Contracts signed — auto from CRM; exit-type split lives on the Deals board.',37,true)
ON CONFLICT ("key") DO NOTHING;
