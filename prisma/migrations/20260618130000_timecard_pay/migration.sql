-- Time card: per-day adjustments + per-period bonuses (pay = hours*rate + bonuses).
CREATE TABLE "TimeAdjustment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "deductHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TimeAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TimeAdjustment_userId_date_key" ON "TimeAdjustment"("userId", "date");

CREATE TABLE "Bonus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bonus_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Bonus_userId_periodKey_idx" ON "Bonus"("userId", "periodKey");
