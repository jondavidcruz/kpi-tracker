-- Software & logins directory (no passwords — pointers to the vault only)
CREATE TABLE IF NOT EXISTS "Software" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "url" TEXT NOT NULL DEFAULT '',
    "loginEmail" TEXT NOT NULL DEFAULT '',
    "vaultRef" TEXT NOT NULL DEFAULT '',
    "vaultUrl" TEXT NOT NULL DEFAULT '',
    "mfa" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT '',
    "accessList" TEXT NOT NULL DEFAULT '',
    "plan" TEXT NOT NULL DEFAULT '',
    "monthlyCost" TEXT NOT NULL DEFAULT '',
    "billingCycle" TEXT NOT NULL DEFAULT '',
    "renewalDate" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Software_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Software_category_idx" ON "Software"("category");
