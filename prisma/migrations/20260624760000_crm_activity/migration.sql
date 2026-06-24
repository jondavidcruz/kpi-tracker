CREATE TABLE IF NOT EXISTS "CrmActivity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "calls" INTEGER NOT NULL DEFAULT 0,
  "texts" INTEGER NOT NULL DEFAULT 0,
  "emails" INTEGER NOT NULL DEFAULT 0,
  "stageMoves" INTEGER NOT NULL DEFAULT 0,
  "total" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmActivity_userId_date_key" ON "CrmActivity"("userId", "date");
CREATE INDEX IF NOT EXISTS "CrmActivity_date_idx" ON "CrmActivity"("date");
