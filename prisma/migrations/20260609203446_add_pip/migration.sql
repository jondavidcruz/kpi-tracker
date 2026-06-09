-- CreateTable
CREATE TABLE "Pip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kpiKey" TEXT NOT NULL,
    "kpiName" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL DEFAULT 'coaching',
    "status" TEXT NOT NULL DEFAULT 'open',
    "reason" TEXT NOT NULL DEFAULT '',
    "goalNote" TEXT NOT NULL DEFAULT '',
    "plan" TEXT NOT NULL DEFAULT '',
    "support" TEXT NOT NULL DEFAULT '',
    "consequence" TEXT NOT NULL DEFAULT '',
    "checkins" TEXT NOT NULL DEFAULT '[]',
    "startDate" TEXT NOT NULL DEFAULT '',
    "reviewDate" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pip_status_idx" ON "Pip"("status");

-- AddForeignKey
ALTER TABLE "Pip" ADD CONSTRAINT "Pip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
