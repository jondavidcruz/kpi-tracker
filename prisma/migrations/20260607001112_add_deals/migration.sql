-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'under_contract',
    "assignedTo" TEXT NOT NULL DEFAULT '',
    "buyerName" TEXT NOT NULL DEFAULT '',
    "contractPrice" DOUBLE PRECISION,
    "askingPrice" DOUBLE PRECISION,
    "soldPrice" DOUBLE PRECISION,
    "contractDate" TEXT NOT NULL DEFAULT '',
    "soldDate" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");
