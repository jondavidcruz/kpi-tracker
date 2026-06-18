-- Part-timer work availability (Ethan).
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "hours" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Availability_userId_date_idx" ON "Availability"("userId", "date");
