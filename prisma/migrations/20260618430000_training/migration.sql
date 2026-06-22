-- Training portal tables.
CREATE TABLE "TrainingFocus" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "skill" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1, "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingFocus_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrainingFocus_userId_idx" ON "TrainingFocus"("userId");
CREATE TABLE "TrainingSchedule" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "cadence" TEXT NOT NULL,
    "time" TEXT NOT NULL DEFAULT '', "focus" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrainingSchedule_userId_idx" ON "TrainingSchedule"("userId");
CREATE TABLE "CoachingSession" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "coach" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL, "type" TEXT NOT NULL DEFAULT 'call_review', "skill" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL, "nextStep" TEXT NOT NULL DEFAULT '', "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachingSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CoachingSession_userId_idx" ON "CoachingSession"("userId");

-- Seed coaching focuses (idempotent: only if the rep exists and has no focuses yet).
INSERT INTO "TrainingFocus" ("id","userId","skill","priority","status","notes")
SELECT v.id, u.id, v.skill, v.priority, 'active', v.notes
FROM (VALUES
  ('tf_mich_1','Michelle','Building rapport',1,'Top focus — daily live coaching on the spot.'),
  ('tf_mich_2','Michelle','Negotiating the agreement to signed',2,'Close the verbal into a signed contract.'),
  ('tf_marie_1','Marie','Underwriting',1,'Sharpen deal analysis / MAO.'),
  ('tf_marie_2','Marie','Leadership (managing the girls)',2,'Ops manager — coach and hold the team accountable.'),
  ('tf_marie_3','Marie','Rapport with developers',3,'Build rapport when reaching developers.'),
  ('tf_shar_1','Sharyn','Building rapport',1,'Already friendly — refine rapport.'),
  ('tf_shar_2','Sharyn','Negotiating lower prices',2,'Get price reductions from sellers.'),
  ('tf_shar_3','Sharyn','Assertiveness with developer gatekeepers',3,'Get past receptionists who think we are a scam; be taken seriously.')
) AS v(id, who, skill, priority, notes)
JOIN "User" u ON u.name LIKE v.who || '%'
WHERE NOT EXISTS (SELECT 1 FROM "TrainingFocus" t WHERE t."userId" = u.id);

-- Seed schedules.
INSERT INTO "TrainingSchedule" ("id","userId","cadence","time","focus")
SELECT v.id, u.id, v.cadence, v.time, v.focus
FROM (VALUES
  ('ts_mich','Michelle','daily','9:30 AM','Call review + live coaching — rapport & closing'),
  ('ts_marie','Marie','weekly','','Underwriting + leadership coaching'),
  ('ts_shar','Sharyn','weekly','','Rapport, price negotiation & developer assertiveness')
) AS v(id, who, cadence, time, focus)
JOIN "User" u ON u.name LIKE v.who || '%'
WHERE NOT EXISTS (SELECT 1 FROM "TrainingSchedule" t WHERE t."userId" = u.id);
