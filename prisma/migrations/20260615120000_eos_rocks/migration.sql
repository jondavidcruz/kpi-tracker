-- EOS Rocks — quarterly priorities
CREATE TABLE IF NOT EXISTS "Rock" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "owner" TEXT NOT NULL DEFAULT '',
    "isCompany" BOOLEAN NOT NULL DEFAULT false,
    "quarter" TEXT NOT NULL DEFAULT '',
    "dueDate" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'on_track',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "milestones" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Rock_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Rock_quarter_idx" ON "Rock"("quarter");
