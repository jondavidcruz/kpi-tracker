-- Seed call-type FOUNDATION outlines (derived from the master script guide).
-- Editable in the Call scripts manager; only seeds where not already set.
INSERT INTO "CallScript" ("id","callType","script") VALUES ('ff6cf2f512584685a3a481f06ce78e6f','aq_discovery','DISCOVERY / APPT-SET — foundations:
1) Opener — earn the conversation, build quick credibility.
2) Why you''re calling — clear and direct.
3) Quick interest check — are they open to an offer?
4) Light property / condition questions.
5) Motivation & timeline — uncover the real reason and urgency.
6) Soft close — set the appointment / next step.
Goal: book the appointment.') ON CONFLICT ("callType") DO NOTHING;
INSERT INTO "CallScript" ("id","callType","script") VALUES ('a7bca1476830409699b22988042bc884','aq_luxury_process','LUXURY PROCESS — foundations:
1) Opener — credibility, professional tone.
2) Why you''re calling.
3) Lot & development questions (size, zoning, potential).
4) Motivation & timeline.
5) What makes Freedom Offers different (certainty, speed, discretion).
6) Soft close — advance to next step.
Goal: position FO as the premium, certain buyer.') ON CONFLICT ("callType") DO NOTHING;
INSERT INTO "CallScript" ("id","callType","script") VALUES ('60b227f20f3541b085f35706d7456996','aq_traditional_process','TRADITIONAL PROCESS — foundations:
1) Opener — build trust.
2) Why you''re calling.
3) Quick interest check.
4) Property condition & details.
5) Motivation & timeline.
6) Soft close.
Goal: fully qualify the deal and move toward an offer.') ON CONFLICT ("callType") DO NOTHING;
INSERT INTO "CallScript" ("id","callType","script") VALUES ('b5d1fee3e182480ea4962e6cb78b429a','aq_offer','OFFER CALL — foundations:
1) Recap their motivation & timeline.
2) Present the number with clear rationale (condition, comps, certainty/speed).
3) Anchor and justify the price.
4) Trial close — gauge reaction.
5) Handle the reaction without getting defensive.
6) Lock the next step.
Goal: get a yes or a clear path to it.') ON CONFLICT ("callType") DO NOTHING;
INSERT INTO "CallScript" ("id","callType","script") VALUES ('02b2bfab11b14e02bf176087fd559e10','aq_negotiation','NEGOTIATION — foundations:
1) Re-anchor on motivation & timeline.
2) Acknowledge the concern genuinely.
3) Bridge with value (certainty, as-is, speed, no fees).
4) Present adjusted terms or hold firm with rationale.
5) Use silence — let them respond.
6) Close the gap to agreement.
Goal: reach a number/terms both can accept.') ON CONFLICT ("callType") DO NOTHING;
INSERT INTO "CallScript" ("id","callType","script") VALUES ('be75186326ac4bd1893d368bf5a121ed','aq_contract','CONTRACT CALL — foundations:
1) Confirm the agreed terms & expectations.
2) Walk through the agreement in plain language.
3) Address any last hesitations.
4) Get the signature.
5) Set clear next steps & timeline (title, inspection, close).
Goal: signed contract + a confident seller.') ON CONFLICT ("callType") DO NOTHING;
INSERT INTO "CallScript" ("id","callType","script") VALUES ('4200b7873fec4bdaa6bd15a08e7acbc2','ds_seller_intro','DS SELLER INTRO — foundations:
1) Intro & credibility — who we are, why calling.
2) Confirm the property & their situation.
3) Set expectations on our process & timeline.
4) Build rapport / trust.
5) Soft close to the next step.
Goal: establish the relationship and the path forward.') ON CONFLICT ("callType") DO NOTHING;
INSERT INTO "CallScript" ("id","callType","script") VALUES ('dc31b4e9ad1349b6a678c7e68ec08466','ds_agent_listing_intro','AGENT LISTING INTRO — foundations:
1) Cold opener with the agent.
2) Understand their listings / sellers.
3) Share how we help move deals.
4) Understand their needs / buy box.
5) Commission incentive — what''s in it for them.
6) Soft close — next step.
Goal: build the agent as a channel.') ON CONFLICT ("callType") DO NOTHING;
INSERT INTO "CallScript" ("id","callType","script") VALUES ('cf03007bf0994ecf86ff0003f7585dbe','ds_agent_buyer_intro','AGENT BUYER INTRO — foundations:
1) Cold opener.
2) Get their flip-buyer / investor profile.
3) Share the property (address + condition only).
4) Understand the buyer''s buy box.
5) Commission incentive.
6) Soft close.
Goal: match our deal to their buyers.') ON CONFLICT ("callType") DO NOTHING;
INSERT INTO "CallScript" ("id","callType","script") VALUES ('62e652ec2f754ef9b5dc19609afc1d6c','ds_agent_pocket_deal','AGENT POCKET DEAL — foundations:
1) Opening after sending the deal.
2) Clarify the opportunity.
3) Why you''re interested / why it fits.
4) Commission & incentive.
5) Soft close.
Goal: source the pocket / off-market deal.') ON CONFLICT ("callType") DO NOTHING;
INSERT INTO "CallScript" ("id","callType","script") VALUES ('a7ea3af8f6f64b9696e62991a6d4d882','ds_flipper_intro','FLIPPER INTRO — foundations:
1) Opening — who we are.
2) Qualify their buy box (areas, price, condition, returns).
3) Present the deal (address + condition).
4) Close — gauge interest, move to an offer.
Goal: add a qualified flipper buyer / move a deal.') ON CONFLICT ("callType") DO NOTHING;
INSERT INTO "CallScript" ("id","callType","script") VALUES ('4c5dcc50da8a45b882b016416d1fb11c','ds_developer_intro','DEVELOPER INTRO — foundations:
1) Opening.
2) Understand their buy box (lot size, zoning, density, target areas).
3) Present the opportunity.
4) Close — next step / offer.
Goal: qualify and engage a developer buyer.') ON CONFLICT ("callType") DO NOTHING;
INSERT INTO "CallScript" ("id","callType","script") VALUES ('22af21b222174b0fb6b51b7d8fb6835d','ds_seller_reduction','SELLER REDUCTION — foundations:
1) Re-anchor on market feedback / comps / days on market.
2) Empathize — acknowledge it''s not easy.
3) Present the reduction with data and rationale.
4) Confirm the new price.
5) Set the next step.
Goal: secure a realistic price to move the deal.') ON CONFLICT ("callType") DO NOTHING;
INSERT INTO "CallScript" ("id","callType","script") VALUES ('9ef3b96eaadd4cdd8e3643f7e4897a62','ds_buyer_offer','BUYER OFFER — foundations:
1) Present the deal (address + condition only).
2) Qualify against their buy box.
3) Handle questions / objections.
4) Ask for the offer / commitment.
5) Confirm terms & next steps.
Goal: get a written offer from the buyer.') ON CONFLICT ("callType") DO NOTHING;
