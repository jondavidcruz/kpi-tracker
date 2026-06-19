-- Leader-assigned tasks/notes to a rep in the daily huddle (persist until done).
CREATE TABLE "HuddleTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL DEFAULT '',
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HuddleTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HuddleTask_userId_idx" ON "HuddleTask"("userId");
