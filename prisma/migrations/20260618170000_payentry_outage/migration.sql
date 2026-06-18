-- Per-period payroll entry: Marie's authoritative paid hours (source of truth)
-- plus a dollar discrepancy/clawback, matching the Excel "Hours" + "Discrepancies".
CREATE TABLE "PayEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "manualHours" DOUBLE PRECISION,
    "adjustAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayEntry_userId_periodKey_key" ON "PayEntry"("userId", "periodKey");

-- Self-reported power / internet outages (unpaid). Start/end stored as minutes
-- from local midnight so we can deduct the exact duration from worked time.
CREATE TABLE "Outage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'internet',
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Outage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Outage_userId_date_idx" ON "Outage"("userId", "date");
