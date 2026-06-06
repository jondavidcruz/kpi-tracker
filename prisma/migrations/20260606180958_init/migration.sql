-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'rep',
    "position" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "irregularSchedule" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kpi" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL DEFAULT '',
    "cadence" TEXT NOT NULL,
    "goalValue" DOUBLE PRECISION,
    "goalKind" TEXT NOT NULL DEFAULT 'at_least',
    "computed" BOOLEAN NOT NULL DEFAULT false,
    "formula" TEXT,
    "definition" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Target" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "userId" TEXT,
    "period" TEXT,
    "goalValue" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Target_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "userId" TEXT,
    "date" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "enteredBy" TEXT NOT NULL DEFAULT '',
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "userId" TEXT,
    "date" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "expected" DOUBLE PRECISION NOT NULL,
    "actual" DOUBLE PRECISION NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "channelsSent" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "googleChatWebhook" TEXT NOT NULL DEFAULT '',
    "alertEmailRecipients" TEXT NOT NULL DEFAULT '',
    "emailFromAddress" TEXT NOT NULL DEFAULT '',
    "workdayCutoff" TEXT NOT NULL DEFAULT '18:00',
    "weekStart" TEXT NOT NULL DEFAULT 'monday',
    "orgTimezone" TEXT NOT NULL DEFAULT 'America/New_York',

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Kpi_key_key" ON "Kpi"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Target_kpiId_userId_period_key" ON "Target"("kpiId", "userId", "period");

-- CreateIndex
CREATE INDEX "Entry_date_idx" ON "Entry"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_kpiId_userId_date_key" ON "Entry"("kpiId", "userId", "date");

-- CreateIndex
CREATE INDEX "Alert_status_idx" ON "Alert"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_kpiId_userId_date_severity_key" ON "Alert"("kpiId", "userId", "date", "severity");

-- AddForeignKey
ALTER TABLE "Target" ADD CONSTRAINT "Target_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Target" ADD CONSTRAINT "Target_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
