-- Persistent highlights/wins log for the Monday meeting.
CREATE TABLE "MeetingHighlight" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "weekOf" TEXT NOT NULL DEFAULT '',
    "addedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingHighlight_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MeetingHighlight_createdAt_idx" ON "MeetingHighlight"("createdAt");
