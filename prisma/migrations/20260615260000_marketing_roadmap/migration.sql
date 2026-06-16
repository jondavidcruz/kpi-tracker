-- Marketing directory + Roadmap backlog + marketing research settings.
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "marketingMarkets" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "marketingResearch" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "MarketContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'distressed',
    "type" TEXT NOT NULL DEFAULT '',
    "market" TEXT NOT NULL DEFAULT '',
    "contact" TEXT NOT NULL DEFAULT '',
    "buyBox" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MarketContact_category_idx" ON "MarketContact"("category");

CREATE TABLE IF NOT EXISTS "RoadmapItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'Other',
    "status" TEXT NOT NULL DEFAULT 'todo',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoadmapItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RoadmapItem_status_idx" ON "RoadmapItem"("status");

-- Seed the backlog (done = already built; doing = in progress; todo = upcoming).
INSERT INTO "RoadmapItem" ("id","title","category","status","sortOrder") VALUES
  ('rm_warroom','Centralized War Room hub (native — chosen over Notion/ClickUp)','Hub','done',1),
  ('rm_kpis','Live KPI dashboard + weekly/monthly reports','Hub','done',2),
  ('rm_scripts','Scripts library by department','Hub','done',3),
  ('rm_aichamp','AI Champion program (post AI ideas)','Hub','done',4),
  ('rm_change','Change Portal (team feedback / change requests)','Hub','done',5),
  ('rm_vault','Software & passwords vault (encrypted)','Hub','done',6),
  ('rm_auth','Email + password login','Hub','done',7),
  ('rm_eos','EOS system — Vision / Rocks / Issues / L10 / Accountability','Process','done',8),
  ('rm_marketing','Marketing section — buyers/developers/flippers, markets, research','Marketing','doing',9),
  ('rm_roadmap','This roadmap / backlog tracker','Hub','doing',10),
  ('rm_timecards','Time cards / time tracker page (import the Excel tracker)','Hub','todo',11),
  ('rm_expenses','Expense log page','Hub','todo',12),
  ('rm_training','Training portal — call reviews, AI training, system training','Training','todo',13),
  ('rm_onboard','Onboarding workflow — checklist + access provisioning','Process','todo',14),
  ('rm_offboard','Offboarding workflow — checklist + access revocation','Process','todo',15),
  ('rm_sops','Core Processes / SOPs pages (EOS Process pillar)','Process','todo',16),
  ('rm_policies','Company policies / handbook page','Process','todo',17),
  ('rm_funnel','Conversion funnel + goal forecast (leads -> appts -> offers -> contracts -> closings)','Analytics','todo',18),
  ('rm_mktroi','Marketing ROI by source (PPL vs SMS vs Direct Mail)','Analytics','todo',19),
  ('rm_scorecard','Formal EOS 13-week weekly scorecard','Analytics','todo',20),
  ('rm_culture','Culture reminders — birthdays & work anniversaries','Other','todo',21),
  ('rm_rollout','Roll out hub to team + assign a weekly content owner','Process','todo',22)
ON CONFLICT ("id") DO NOTHING;
