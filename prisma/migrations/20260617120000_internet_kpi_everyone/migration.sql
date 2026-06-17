-- Make the daily internet-speed test a real KPI tracked for the WHOLE team.
-- Idempotent: only creates the KPI if none already exists (guards on both the
-- roleKey the entry card binds to AND the legacy slug, so we never duplicate it).
INSERT INTO "Kpi" (
  "id","key","name","emoji","category","unit","scope","roleKey","cadence",
  "goalValue","goalKind","computed","definition","sortOrder","active"
)
SELECT
  'kpi_internet_speed',
  'internet_speed',
  'Internet Speed',
  '📡',
  'blue',
  'count',
  'per_rep',
  'internet',
  'daily',
  50,
  'at_least',
  false,
  'Daily in-app speed test (Mbps). Goal 50+ for a smooth dialer, calls, and CRM. Run it at the start of every shift.',
  COALESCE((SELECT MAX("sortOrder") FROM "Kpi"), 0) + 1,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "Kpi" WHERE "roleKey" = 'internet' OR "key" = 'internet_speed'
);

-- Make sure the existing internet KPI (however it was created) is active and
-- bound to the role the entry card + dashboard panel look up.
UPDATE "Kpi" SET "roleKey" = 'internet', "active" = true WHERE "key" = 'internet_speed';

-- Everyone on the active roster logs their internet speed daily.
UPDATE "User" SET "tracksInternet" = true WHERE "active" = true;
