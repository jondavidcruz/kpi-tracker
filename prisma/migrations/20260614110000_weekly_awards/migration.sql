-- Weekly top-performer wins for the gamified leaderboard
CREATE TABLE IF NOT EXISTS "WeeklyAward" (
    "id" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "repName" TEXT NOT NULL,
    "kpiName" TEXT NOT NULL DEFAULT '',
    "value" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeeklyAward_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyAward_weekStart_role_key" ON "WeeklyAward"("weekStart","role");
