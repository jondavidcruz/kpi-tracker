-- Team 360 — peer strengths/weaknesses assessments. Brand-new, isolated table.
CREATE TABLE "PeerAssessment" (
    "id" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "superpower" TEXT NOT NULL DEFAULT '',
    "strengths" TEXT NOT NULL DEFAULT '',
    "growth" TEXT NOT NULL DEFAULT '',
    "rComm" INTEGER NOT NULL DEFAULT 0,
    "rFollow" INTEGER NOT NULL DEFAULT 0,
    "rSkill" INTEGER NOT NULL DEFAULT 0,
    "rCoach" INTEGER NOT NULL DEFAULT 0,
    "rCulture" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PeerAssessment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PeerAssessment_quarter_raterId_subjectId_key" ON "PeerAssessment"("quarter", "raterId", "subjectId");
CREATE INDEX "PeerAssessment_quarter_subjectId_idx" ON "PeerAssessment"("quarter", "subjectId");
