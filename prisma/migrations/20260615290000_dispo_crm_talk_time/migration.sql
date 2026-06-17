-- CRM Talk Time for the Dispositions scorecard (Sharyn + Marie), at the end
-- next to Dialer Talk Time. Tracked (no goal) — buyer-side talk time.
INSERT INTO "Kpi" ("id","key","name","emoji","category","unit","scope","roleKey","cadence","goalKind","definition","sortOrder")
VALUES ('kpi_ds_talk','ds_talk_time','CRM Talk Time','🎧','blue','duration','per_rep','dispositions','daily','tracked','Talk time logged in the CRM with buyers.',899)
ON CONFLICT ("key") DO NOTHING;
