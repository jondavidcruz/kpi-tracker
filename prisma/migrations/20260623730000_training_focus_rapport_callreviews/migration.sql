-- Marie also trains on rapport; everyone gets Call Reviews as a focus. Idempotent.
INSERT INTO "TrainingFocus" ("id", "userId", "skill", "priority", "status", "notes", "createdAt")
SELECT gen_random_uuid()::text, u.id, s.skill, s.pri, 'active', '', now()
FROM (VALUES
  ('Marie',    'Rapport building', 2),
  ('Marie',    'Call reviews',     4),
  ('Sharyn',   'Call reviews',     4),
  ('Michelle', 'Call reviews',     4)
) AS s(first, skill, pri)
JOIN "User" u ON u.name LIKE s.first || '%'
WHERE NOT EXISTS (
  SELECT 1 FROM "TrainingFocus" tf WHERE tf."userId" = u.id AND tf."skill" = s.skill
);
