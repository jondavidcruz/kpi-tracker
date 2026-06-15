-- Private owner-only team HR/payment records
CREATE TABLE IF NOT EXISTS "TeamProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "birthday" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "startDate" TEXT NOT NULL DEFAULT '',
    "lastPromotion" TEXT NOT NULL DEFAULT '',
    "payScale" TEXT NOT NULL DEFAULT '',
    "payPeriod" TEXT NOT NULL DEFAULT '',
    "payMethod" TEXT NOT NULL DEFAULT 'Wise',
    "payDetails" TEXT NOT NULL DEFAULT '',
    "about" TEXT NOT NULL DEFAULT '',
    "performance" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TeamProfile_userId_key" ON "TeamProfile"("userId");
