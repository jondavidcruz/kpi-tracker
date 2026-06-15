-- EOS Accountability Chart seats (+ GWC)
CREATE TABLE IF NOT EXISTS "Seat" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "holder" TEXT NOT NULL DEFAULT '',
    "roles" TEXT NOT NULL DEFAULT '',
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "gwcGet" TEXT NOT NULL DEFAULT '',
    "gwcWant" TEXT NOT NULL DEFAULT '',
    "gwcCapacity" TEXT NOT NULL DEFAULT '',
    "gwcNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Seat_parentId_idx" ON "Seat"("parentId");
