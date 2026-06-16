-- Seed Freedom Offers' V/TO, Q2-2026 company Rocks, and the Accountability Chart.
-- Idempotent: V/TO fills only blank fields; Rocks/Seats use fixed ids + ON CONFLICT.

-- ---- V/TO (single row id=1) ----
INSERT INTO "Vto" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;

UPDATE "Vto" SET "coreValues" =
'Integrity in Every Deal — We operate with transparency, accountability, and professionalism in every relationship and transaction.
Community-Driven Growth — We believe real estate should strengthen communities while creating opportunity for future generations.
Strategic Partnerships — We work collaboratively with homeowners, developers, investors, and industry professionals to create meaningful outcomes.'
WHERE "id" = 1 AND "coreValues" = '';

UPDATE "Vto" SET "tenYearTarget" =
'By our 10-year anniversary (founded June 6, 2023): developing luxury residential properties and expanded into luxury garage-condo commercial properties. Luxury wholesaling and traditional flips become exit strategies only — no longer our primary driver or income. $100M+ in profit generated.'
WHERE "id" = 1 AND "tenYearTarget" = '';

UPDATE "Vto" SET "threeYrDate" = 'By 2029' WHERE "id" = 1 AND "threeYrDate" = '';
UPDATE "Vto" SET "threeYrProfit" = '$3M generated' WHERE "id" = 1 AND "threeYrProfit" = '';
UPDATE "Vto" SET "threeYrPicture" =
'Consistently developing luxury residential properties.
Wholesaling is now a secondary driver to our primary development strategy.
Wholesaling is also our main marketing engine to feed our own developments.'
WHERE "id" = 1 AND "threeYrPicture" = '';

UPDATE "Vto" SET "oneYrDate" = 'By 2027' WHERE "id" = 1 AND "oneYrDate" = '';
UPDATE "Vto" SET "oneYrProfit" = '$500k+ generated' WHERE "id" = 1 AND "oneYrProfit" = '';
UPDATE "Vto" SET "oneYrGoals" =
'Consistently close luxury and traditional wholesale properties.
Average 2-3 deals per month closing.
$500k+ in profit generated.'
WHERE "id" = 1 AND "oneYrGoals" = '';

-- ---- Q2-2026 company Rocks ----
INSERT INTO "Rock" ("id","title","owner","isCompany","quarter","dueDate","status","progress","milestones","notes","sortOrder")
VALUES
  ('rock_warroom','Make the War Room 100% operational and keep the team at 100% productivity and efficiency','',true,'2026-Q2','2026-06-30','on_track',0,'','',0),
  ('rock_train','Train the team daily — underwriting, negotiating/signing deals, and speeding up dispo to close in under 30 days','',true,'2026-Q2','2026-06-30','on_track',0,'','',1),
  ('rock_crm','Automate CRM follow-up workflows','',true,'2026-Q2','2026-06-30','on_track',0,'','',2),
  ('rock_mail','Launch our first direct mail + SMS campaign for luxury wholesale leads','',true,'2026-Q2','2026-06-30','on_track',0,'','',3),
  ('rock_ai','Optimize AI to be fully automated in our system, working 24/7','',true,'2026-Q2','2026-06-30','on_track',0,'','',4)
ON CONFLICT ("id") DO NOTHING;

-- ---- Accountability Chart seats (everyone reports to the Integrator) ----
INSERT INTO "Seat" ("id","title","holder","roles","parentId","sortOrder","gwcGet","gwcWant","gwcCapacity","gwcNote")
VALUES
  ('seat_visionary','Visionary','Jon Cruz',
    'Big vision & direction
Key relationships
Company culture
Big opportunities & deals',
    NULL,0,'','','',''),
  ('seat_integrator','Integrator','Jon Cruz (with Cortana / Claude)',
    'Run day-to-day operations
Lead, manage & hold accountable (LMA)
Harmonize the team
Execute the business plan & remove obstacles',
    'seat_visionary',1,'','','',''),
  ('seat_ops','Operations Manager — VA Team & Underwriting','Marie',
    'Lead the VA team
Underwrite deals
Process & SOP adherence',
    'seat_integrator',2,'','','','Being groomed to manage Acquisitions & Dispositions.'),
  ('seat_dispo','Dispositions Manager','Sharyn',
    'Manage dispositions
Buyer relationships & buyers list
Close deals in under 30 days',
    'seat_integrator',3,'','','',''),
  ('seat_aq_michelle','Acquisitions Agent','Michelle',
    'Acquisitions calls & appointments
Negotiate & sign deals',
    'seat_integrator',4,'','','',''),
  ('seat_aq_ethan','Licensed Acquisitions Agent','Ethan',
    'Licensed acquisitions
Negotiate & sign deals
Higher-value / licensed transactions',
    'seat_integrator',5,'','','',''),
  ('seat_marketing','Marketing Director','Viktoriia',
    'Marketing strategy & campaigns
Direct mail + SMS
Lead generation',
    'seat_integrator',6,'','','',''),
  ('seat_cfo','Chief Financial Officer (Business Partner)','Enrico',
    'Financial oversight
Budgeting & reporting
Cash flow management',
    'seat_integrator',7,'','','','Passive partner — financials only.')
ON CONFLICT ("id") DO NOTHING;
