-- EOS Vision/Traction Organizer (single row)
CREATE TABLE IF NOT EXISTS "Vto" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "coreValues" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "niche" TEXT NOT NULL DEFAULT '',
    "tenYearTarget" TEXT NOT NULL DEFAULT '',
    "targetMarket" TEXT NOT NULL DEFAULT '',
    "uniques" TEXT NOT NULL DEFAULT '',
    "provenProcess" TEXT NOT NULL DEFAULT '',
    "guarantee" TEXT NOT NULL DEFAULT '',
    "threeYrDate" TEXT NOT NULL DEFAULT '',
    "threeYrRevenue" TEXT NOT NULL DEFAULT '',
    "threeYrProfit" TEXT NOT NULL DEFAULT '',
    "threeYrMeasurables" TEXT NOT NULL DEFAULT '',
    "threeYrPicture" TEXT NOT NULL DEFAULT '',
    "oneYrDate" TEXT NOT NULL DEFAULT '',
    "oneYrRevenue" TEXT NOT NULL DEFAULT '',
    "oneYrProfit" TEXT NOT NULL DEFAULT '',
    "oneYrMeasurables" TEXT NOT NULL DEFAULT '',
    "oneYrGoals" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Vto_pkey" PRIMARY KEY ("id")
);
INSERT INTO "Vto" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
