-- Checkable huddle items (goals for today / pending from yesterday).
CREATE TABLE "HuddleCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HuddleCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HuddleCheck_userId_date_idx" ON "HuddleCheck"("userId", "date");
