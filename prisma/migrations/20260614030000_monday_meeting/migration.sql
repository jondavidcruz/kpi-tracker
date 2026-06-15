-- Monday Meeting: settings fields + training-tip backlog
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "homeownersGoal" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "revenueStretchGoal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "goalReward" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "stretchReward" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "mtgAnnouncements" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "mtgComingSoon" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "mtgTalkingPoints" TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS "TrainingTip" ("id" TEXT NOT NULL,"text" TEXT NOT NULL,"kpiKey" TEXT NOT NULL DEFAULT '',"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "TrainingTip_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "TrainingTip_kpiKey_idx" ON "TrainingTip"("kpiKey");
INSERT INTO "Settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
UPDATE "Settings" SET "annualRevenueGoal"=500000 WHERE "id"=1 AND "annualRevenueGoal"=0;
UPDATE "Settings" SET "revenueStretchGoal"=600000 WHERE "id"=1 AND "revenueStretchGoal"=0;
UPDATE "Settings" SET "homeownersGoal"=24 WHERE "id"=1 AND "homeownersGoal"=0;
UPDATE "Settings" SET "goalReward"='Boracay / Cebu PH team vacation + $250 VA bonus' WHERE "id"=1 AND "goalReward"='';
UPDATE "Settings" SET "stretchReward"='+$250 additional VA bonus ($500 total)' WHERE "id"=1 AND "stretchReward"='';
UPDATE "Settings" SET "mtgComingSoon"='Time tracker portal via Claude with live alerts
Training portal via Claude
Offers-made calls reviewed via AI to sharpen
Underwriting reviewed via AI for improvements
SMS & email automation via AI for outbound' WHERE "id"=1 AND "mtgComingSoon"='';
INSERT INTO "TrainingTip" ("id","text","kpiKey") VALUES ('af617351296b47328b783712fe24253c','Lead with the number. Walk into every appointment with comps and an offer ready — present on the first visit whenever the data allows.','offers_made') ON CONFLICT ("id") DO NOTHING;
INSERT INTO "TrainingTip" ("id","text","kpiKey") VALUES ('31d9411ec4bd4dea84b5e54f9a96af9c','Confirm twice: a text the night before and a call 1 hour out. Confirmed appointments show up; unconfirmed ones don''t.','appts_taken') ON CONFLICT ("id") DO NOTHING;
INSERT INTO "TrainingTip" ("id","text","kpiKey") VALUES ('1dfa05b85239464289f7573aa52ddb15','Talk time is the leading indicator. Block two uninterrupted power-dial hours daily before email or Slack.','talk_time') ON CONFLICT ("id") DO NOTHING;
INSERT INTO "TrainingTip" ("id","text","kpiKey") VALUES ('5b1d45f33f874e36b776b05b81f4ef64','Every new listing is a buyer-magnet — blast it to your top cash buyers the hour it goes under contract, not the next day.','new_buyers') ON CONFLICT ("id") DO NOTHING;
INSERT INTO "TrainingTip" ("id","text","kpiKey") VALUES ('76d6d224f6834b769607ddb3a932ffce','Ask for the signature on the call. ''I can send the agreement right now while we''re together — does that work?''','contracts') ON CONFLICT ("id") DO NOTHING;
INSERT INTO "TrainingTip" ("id","text","kpiKey") VALUES ('706902f85f42400f96e02bef4e18410d','Speed to lead wins. Call a new PPL lead within 5 minutes — conversion drops sharply after the first 30.','ppl_leads') ON CONFLICT ("id") DO NOTHING;
INSERT INTO "TrainingTip" ("id","text","kpiKey") VALUES ('0483c12cab6f47bea97cc048fe38bea5','Match the deal to the buyer, don''t spray. A targeted send to 5 right buyers beats a blast to 50.','deals_sent') ON CONFLICT ("id") DO NOTHING;
INSERT INTO "TrainingTip" ("id","text","kpiKey") VALUES ('d2682844772f4898a846f4634592cc4c','Tie every activity back to the mission: each contract is a homeowner we helped and a step toward the annual goal.','') ON CONFLICT ("id") DO NOTHING;
INSERT INTO "TrainingTip" ("id","text","kpiKey") VALUES ('ae621d42f52146f4a9534b5f1185cd1b','Tag a recorded call this week and run it through Call Scoring — review one strength and one fix together.','') ON CONFLICT ("id") DO NOTHING;
