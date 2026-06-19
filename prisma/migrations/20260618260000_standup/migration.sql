-- Daily 9am-huddle: per-person submission + hot-lead items.
CREATE TABLE "Standup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "goal" TEXT NOT NULL DEFAULT '',
    "pending" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "submitted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Standup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Standup_userId_date_key" ON "Standup"("userId", "date");

CREATE TABLE "StandupItem" (
    "id" TEXT NOT NULL,
    "standupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT '',
    "roadblock" TEXT NOT NULL DEFAULT '',
    "nextStep" TEXT NOT NULL DEFAULT '',
    "todayAction" TEXT NOT NULL DEFAULT '',
    "hot" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StandupItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StandupItem_standupId_idx" ON "StandupItem"("standupId");
ALTER TABLE "StandupItem" ADD CONSTRAINT "StandupItem_standupId_fkey" FOREIGN KEY ("standupId") REFERENCES "Standup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
