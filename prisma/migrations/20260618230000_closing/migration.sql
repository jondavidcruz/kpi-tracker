-- Escrow & Closing tracker: a deal's gross revenue, every expense line, final profit.
CREATE TABLE "Closing" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "buyer" TEXT NOT NULL DEFAULT '',
    "exit" TEXT NOT NULL DEFAULT 'assignment',
    "status" TEXT NOT NULL DEFAULT 'escrow',
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openedDate" TEXT NOT NULL DEFAULT '',
    "closeDate" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Closing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClosingExpense" (
    "id" TEXT NOT NULL,
    "closingId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "ClosingExpense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClosingExpense_closingId_idx" ON "ClosingExpense"("closingId");
ALTER TABLE "ClosingExpense" ADD CONSTRAINT "ClosingExpense_closingId_fkey" FOREIGN KEY ("closingId") REFERENCES "Closing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
