-- Follow-up date on buyers + seeded outreach templates.
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "nextFollowUp" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "outreachTemplates" TEXT NOT NULL DEFAULT '';

UPDATE "Settings" SET "outreachTemplates" =
'DM / EMAIL OPENER
Following your work — [reference a recent project]. I source off-market pre-1980 tear-down lots in [Newport / La Jolla]. What is your buy box — target areas, min lot size, max land basis? I will send deals that fit before they hit market.

LEVERAGE TO BAKE IN
- USD real estate program (credibility + mentorship hook) — strongest with Preston Dubreville (USD alum).
- Air Force veteran (trust signal) — vet-to-vet with Ben Ryan @ Tourmaline (former Navy SEAL).
- Business owner / deal source, not a vendor — flips the power dynamic.
- Small ask: their buy box (areas, min lot size, max land basis). The call is the follow-up.

CONTACT SEQUENCE
1 IG DM (warm 2-3 posts first) -> 2 Email -> 3 Phone -> 4 SMS -> 5 Web form -> 6 Office visit -> 7 Direct mail -> 8 USD warm intro.
No reply in 4-5 days -> escalate one channel. Founder-led shops -> DM/text the person; team shops -> email + office.'
WHERE "id" = 1 AND "outreachTemplates" = '';
