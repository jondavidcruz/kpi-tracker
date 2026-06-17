-- Outreach-tracking fields + pin every named developer (OC, Nashville, SD, HI).
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "igHandle" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "bestContact" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "lastContacted" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "outreachLog" TEXT NOT NULL DEFAULT '';

INSERT INTO "MarketContact" ("id","name","category","type","region","market","status","email","phone","website","buyBox","buyBoxAreas","notes","lat","lng","sortOrder") VALUES
  ('mc_brandon','Brandon Architects','luxury','custom','OC','Newport Beach','To Vet','','','brandonarchitects.com','Architect-led; pairs with Patterson; modern coastal','Newport, Corona del Mar','Will buy with a builder partner.',33.6189,-117.9298,40),
  ('mc_mckinley','McKinley Homes','luxury','developer','OC','Newport Beach','To Vet','','','mckinleyhomes.com','7,000+ sqft lots, no view restrictions','Newport, Irvine','Mid-large lot estates.',33.6189,-117.9298,41),
  ('mc_pinnacle','Pinnacle Custom Homes','luxury','developer','OC','Newport Beach','To Vet','','','','$5M+ end product; large-lot inland or coastal','OC luxury','',33.6189,-117.9298,42),
  ('mc_castle','Castle Homes','luxury','developer','TN','Belle Meade','Priority','','','castlehomes.com','Half-acre+, $3M+ ARV; guaranteed pricing model','Belle Meade, Green Hills, Forest Hills, Brentwood','Southern Living Custom Builder.',36.0982,-86.8569,43),
  ('mc_buildnash','Build Nashville','luxury','developer','TN','Sylvan Park','To Vet','','','buildnashville.com','50x150 OK, $2M+ ARV','Sylvan Park, Green Hills, West Meade','Custom luxury infill.',36.1500,-86.8400,44),
  ('mc_britt','Britt Development Group','luxury','developer','TN','Nashville','To Vet','','','','Historic overlay + new build','Historic overlay districts','Restoration + new build.',36.1627,-86.7816,45),
  ('mc_bell','Bell Construction','luxury','developer','TN','Nashville','To Vet','','','','Estate custom, large lot preferred','37205, 37215, 37212','',36.1064,-86.8295,46),
  ('mc_turnberry','Turnberry Homes','luxury','developer','TN','Brentwood','To Vet','','','turnberryhomes.com','$2.5M+ custom + production luxury','37205, 37215, Brentwood','Buys individual lots in good zips.',36.0331,-86.7828,47),
  ('mc_magness','The Magness Group','luxury','developer','TN','Nashville','To Vet','','','','Urban infill modern, 50x150 OK','12 South, Belmont, 37204','',36.1230,-86.7900,48),
  ('mc_mckay','McKay Co.','luxury','developer','TN','Nashville','To Vet','','','','Mid-luxury infill $2-3M, high volume','The Nations, West Nashville','',36.1550,-86.8500,49),
  ('mc_davidson','Davidson Communities','luxury','developer','SD','Rancho Santa Fe','To Vet','','','davidsoncommunities.com','Architectural luxury since 1978; finished lots + redevelopment','Coastal SD, RSF, North County','',32.9912,-117.2711,50),
  ('mc_mcmillin','McMillin (Cornerstone)','luxury','developer','SD','San Diego','To Vet','','','','Master-planned + select infill','Coastal North County','',32.7157,-117.1611,51),
  ('mc_reside','Reside Custom Homes','luxury','developer','SD','La Jolla','To Vet','','','','Boutique luxury; flex on lot if location premium','La Jolla, Del Mar, Coronado','',32.8328,-117.2713,52),
  ('mc_wakeland','Wakeland Housing & Dev','luxury','developer','SD','San Diego','To Vet','','','','Mixed use + select luxury infill','Urban infill','',32.7157,-117.1611,53),
  ('mc_pyramid','Pyramid Premier Properties','luxury','developer','HI','Kahala','Priority','','','pyramidpremier.com','Fee-simple only, 7,500+ sqft lot, $5M+ ARV','Kahala','#1 Kahala specialist (40+ homes).',21.2769,-157.7811,54),
  ('mc_graham','Graham Builders','luxury','developer','HI','Honolulu','To Vet','','','grahambuilders.com','10,000+ sqft lot preferred','Kahala, Hawaii Kai, Manoa','35-yr design-build; multi-gen + large custom.',21.2769,-157.7811,55),
  ('mc_homeworks','Homeworks Construction','luxury','developer','HI','Honolulu','To Vet','','','','Smaller lots OK if location premium','Oahu-wide','750+ projects, 20+ yrs.',21.3069,-157.8583,56),
  ('mc_h1','H-1 Construction','luxury','developer','HI','Honolulu','To Vet','','','','Mid-luxury custom + remodels','Oahu & outer islands','',21.3069,-157.8583,57),
  ('mc_tall','Tall Builders LLC','luxury','developer','HI','Honolulu','To Vet','','','','Boutique custom; flexible on lot','Oahu','',21.3069,-157.8583,58),
  ('mc_longbay','Long Bay Builders','luxury','developer','HI','Kahala','To Vet','','','','$5M+ ARV; oceanfront focus','Kahala, Diamond Head, Black Point','High-end coastal.',21.2769,-157.7811,59)
ON CONFLICT ("id") DO NOTHING;
