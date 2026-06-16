-- New KPI: Dialer Talk Time (separate from Talk Time) for Acquisitions + Dispositions.
-- Tracked, no goal — adds to total outbound effort. Duration stored in seconds.
INSERT INTO "Kpi" ("id","key","name","emoji","category","unit","scope","roleKey","cadence","goalKind","definition")
VALUES
  ('kpi_acq_dialer_talk','acq_dialer_talk_time','Dialer Talk Time','📟','blue','duration','per_rep','acquisitions','daily','tracked','Talk time logged through the dialer when contacting sellers — adds to total outbound effort.'),
  ('kpi_ds_dialer_talk','ds_dialer_talk_time','Dialer Talk Time','📟','blue','duration','per_rep','dispositions','daily','tracked','Talk time logged through the dialer when contacting buyers — adds to total outbound effort.')
ON CONFLICT ("key") DO NOTHING;
