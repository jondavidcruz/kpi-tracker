-- Acquisitions CRM (GHL replacement, sellers side). Additive only.
CREATE TABLE IF NOT EXISTS "CrmContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "altPhone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '',
    "assignedTo" TEXT NOT NULL DEFAULT '',
    "ghlId" TEXT NOT NULL DEFAULT '',
    "pinnedNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "CrmContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CrmContact_ghlId_idx" ON "CrmContact"("ghlId");
CREATE INDEX IF NOT EXISTS "CrmContact_assignedTo_idx" ON "CrmContact"("assignedTo");

CREATE TABLE IF NOT EXISTS "CrmOpportunity" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'new',
    "value" DOUBLE PRECISION,
    "askPrice" DOUBLE PRECISION,
    "assignedTo" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '',
    "nextFollowUp" TEXT NOT NULL DEFAULT '',
    "devPricingSentAt" TIMESTAMP(3),
    "ghlId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "CrmOpportunity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CrmOpportunity_stage_idx" ON "CrmOpportunity"("stage");
CREATE INDEX IF NOT EXISTS "CrmOpportunity_contactId_idx" ON "CrmOpportunity"("contactId");
CREATE INDEX IF NOT EXISTS "CrmOpportunity_ghlId_idx" ON "CrmOpportunity"("ghlId");
CREATE INDEX IF NOT EXISTS "CrmOpportunity_assignedTo_nextFollowUp_idx" ON "CrmOpportunity"("assignedTo", "nextFollowUp");
DO $$ BEGIN
  ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CrmEvent" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "oppId" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "meta" JSONB,
    "actor" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CrmEvent_contactId_at_idx" ON "CrmEvent"("contactId", "at");
CREATE INDEX IF NOT EXISTS "CrmEvent_oppId_at_idx" ON "CrmEvent"("oppId", "at");

CREATE TABLE IF NOT EXISTS "CrmTask" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL DEFAULT '',
    "oppId" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "due" TEXT NOT NULL DEFAULT '',
    "assignedTo" TEXT NOT NULL DEFAULT '',
    "doneAt" TIMESTAMP(3),
    "doneBy" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CrmTask_assignedTo_doneAt_idx" ON "CrmTask"("assignedTo", "doneAt");
CREATE INDEX IF NOT EXISTS "CrmTask_oppId_idx" ON "CrmTask"("oppId");

CREATE TABLE IF NOT EXISTS "CrmAppointment" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL DEFAULT '',
    "oppId" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "withWho" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "remindedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmAppointment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CrmAppointment_at_idx" ON "CrmAppointment"("at");
CREATE INDEX IF NOT EXISTS "CrmAppointment_oppId_idx" ON "CrmAppointment"("oppId");
