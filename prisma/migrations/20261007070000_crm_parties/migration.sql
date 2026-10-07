-- CRM: associated parties on an opportunity. Additive only.
CREATE TABLE IF NOT EXISTS "CrmParty" (
    "id" TEXT NOT NULL,
    "oppId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmParty_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CrmParty_oppId_idx" ON "CrmParty"("oppId");
