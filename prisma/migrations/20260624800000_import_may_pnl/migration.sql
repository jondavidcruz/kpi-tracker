-- Import May 2026 P&L actuals from Jon's accounting spreadsheet. Upsert so re-runs are safe.
INSERT INTO "ExpenseMonth" ("month", "netSales", "note") VALUES ('2026-05', 0, 'Imported from accounting P&L')
ON CONFLICT ("month") DO UPDATE SET "netSales" = EXCLUDED."netSales";

INSERT INTO "ExpenseLine" ("id","month","category","label","projected","actual","sortOrder","note") VALUES
  (gen_random_uuid()::text,'2026-05','payroll','Contractors salary (15th)',1155.00,793.71,1,''),
  (gen_random_uuid()::text,'2026-05','payroll','Contractors salary (31st)',1022.33,673.42,2,''),
  (gen_random_uuid()::text,'2026-05','payroll','Salary — CEO / US employees',2263.70,1220.40,3,''),
  (gen_random_uuid()::text,'2026-05','payroll','PayPal / Remitly fees',25.75,10.78,4,''),
  (gen_random_uuid()::text,'2026-05','software','Twilio',100.00,270.05,1,''),
  (gen_random_uuid()::text,'2026-05','software','REI Reply CRM',499.01,99.00,2,''),
  (gen_random_uuid()::text,'2026-05','software','Power dialer / BatchDialer',52.40,110.02,3,'BatchDialer — cancelled, drop from July'),
  (gen_random_uuid()::text,'2026-05','software','Bizeecom',29.00,29.00,4,''),
  (gen_random_uuid()::text,'2026-05','software','iSpeedToLead CRM (balance)',0.00,1002.00,5,''),
  (gen_random_uuid()::text,'2026-05','software','Regrid / Loveland',10.00,10.00,6,''),
  (gen_random_uuid()::text,'2026-05','dues','Claude AI',20.00,248.42,1,''),
  (gen_random_uuid()::text,'2026-05','dues','Google domain / Suite',16.80,16.80,2,''),
  (gen_random_uuid()::text,'2026-05','dues','Pipedrive / PropStream',162.20,299.00,3,'PropStream — cancelled, drop from July'),
  (gen_random_uuid()::text,'2026-05','controllable','Company car — electric charge',141.78,152.37,1,''),
  (gen_random_uuid()::text,'2026-05','controllable','Company car — insurance',201.30,201.30,2,''),
  (gen_random_uuid()::text,'2026-05','controllable','Company car — lease',487.82,487.82,3,'')
ON CONFLICT ("month","category","label") DO UPDATE SET "actual" = EXCLUDED."actual", "projected" = EXCLUDED."projected", "note" = EXCLUDED."note";
