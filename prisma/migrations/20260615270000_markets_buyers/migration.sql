-- Markets & Buyers: map + buy-box fields on MarketContact, seeded with the CA
-- developer research (Leaflet map builders + priority outreach developers).
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "region" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "email" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "phone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "website" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "buyBoxAreas" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE "MarketContact" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;

INSERT INTO "MarketContact" ("id","name","category","type","region","market","status","email","phone","website","notes","lat","lng","sortOrder") VALUES
  ('mc_coltov','Coltov','luxury','developer','SD','San Diego','To Vet','info@coltov.com','(877) 777-7965','coltov.com','',32.7157,-117.1611,1),
  ('mc_nuevo','The Nuevo Group','luxury','developer','SD','Rancho Santa Fe','Verify SFR','info@thenuevogroup.com','760-708-7020','thenuevogroup.com','Confirm SFR development',33.0203,-117.2031,2),
  ('mc_equity','Equity Builders','luxury','developer','SD','San Diego','To Vet','contact@ebincsd.com','858-715-0780','ebincsd.com','',32.7157,-117.1611,3),
  ('mc_zephyr','Zephyr','luxury','developer','LA','Los Angeles','Need Phone','info@zephyrpartners.com','','builtbyzephyr.com','Phone not listed publicly',34.0522,-118.2437,4),
  ('mc_andler','Andler Building Co','luxury','developer','SD','San Diego','Low Tier','info@andlerbuildingco.com','619-971-6215','andlerbuildingco.com','Not luxury tier',32.7157,-117.1611,5),
  ('mc_luxview','LuxView Properties','luxury','developer','SD','Oceanside','To Vet','info@theluxview.com','(858) 397-0017','theluxview.com','',33.1959,-117.3795,6),
  ('mc_elda','Elda Developments','luxury','developer','SD','San Diego','To Vet','contact@eldadevelopments.com','619-530-9776','eldadevelopments.com','',32.7157,-117.1611,7),
  ('mc_spaces','Spaces Renewed','luxury','developer','SD','Oceanside','To Vet','BBooth@spacesrenewed.com','(760) 637-2175','spacesrenewed.com','',33.1959,-117.3795,8),
  ('mc_tourmaline','Tourmaline Builders','luxury','developer','SD','Solana Beach','Priority','info@tourmalinebuilders.com','858-799-1020','tourmalinebuilders.com','Ben Ryan, former Navy SEAL. Vet-to-vet angle.',32.9912,-117.2711,9),
  ('mc_rl','RL Remodeling','luxury','remodeler','LA','Woodland Hills','Drop','info@rl-remodeling.com','(888) 781-0688','rl-remodeling.com','Remodeler - not a land buyer',34.1684,-118.6058,10),
  ('mc_smith','Smith Brothers','luxury','custom','SD','Solana Beach','Drop','info@smithbrothersconstruction.com','858-350-1445','smithbrothersconstruction.com','Custom builder - not developer',32.9912,-117.2711,11),
  ('mc_wardell','Wardell Builders','luxury','developer','SD','Solana Beach','To Vet','info@wardellbuilders.com','858-793-4190','wardellbuilders.com','All premium SD zips. Strong feed.',32.9912,-117.2711,12),
  ('mc_kaminskiy','Kaminskiy','luxury','remodeler','SD','San Diego','Drop','','(858) 207-4200','kaminskiyhomeremodeling.com','Remodeler',32.7157,-117.1611,13),
  ('mc_tjh','Thomas James Homes','luxury','developer','OC','Aliso Viejo','Priority','','(877) 381-4092','tjh.com','Major SFR developer (CA/WA/CO)',33.5767,-117.7256,14),
  ('mc_patterson','Patterson Custom Homes','luxury','developer','OC','Newport Beach','To Vet','info@pattersoncustomhomes.com','949-723-1800','pattersoncustomhomes.com','',33.6189,-117.9298,15),
  ('mc_gonterman','Gonterman Custom Homes','luxury','developer','OC','Newport Beach','Priority','jason@gontermanconstruction.com','949-697-0746','gontermanconstruction.com','Jason Gonterman. 31.4K IG, biggest OC coastal feed.',33.6189,-117.9298,16),
  ('mc_jamesdavid','James David','luxury','developer','OC','Irvine','Web Form','','888-847-0823','jamesdavidcustomhomes.com','Use website contact form',33.6846,-117.8265,17),
  ('mc_burkhart','Burkhart Brothers','luxury','developer','OC','Tustin','To Vet','info@burkhartbros.com','949-375-6725','burkhartbros.com','',33.7458,-117.8261,18),
  ('mc_tmgrady','TM Grady','luxury','developer','OC','Laguna Beach','Verify Dev','office@tmgrady.com','949-383-5678','tmgrady.com','Confirm if developer',33.5427,-117.7854,19),
  ('mc_spinnaker','Spinnaker Development','luxury','developer','other','Unknown','Web Form','','','spinndev.com','Contact via website',32.5,-119.3,20),
  ('mc_bonanni','Bonanni Development','luxury','developer','OC','Huntington Beach','Priority','info@bonannidevelopment.com','714-892-0123','bonannidevelopment.com','',33.6603,-117.9992,21),
  ('mc_rutter','Rutter Development','luxury','developer','OC','Newport Beach','Priority','clustig@rutterdevelopment.com','(949) 863-1298','rutterdevelopment.com','Contact: C. Lustig',33.6189,-117.9298,22),
  ('mc_calhome','Cal Home Co','luxury','developer','other','Unknown','Need Info','','','calhomeco.com','Website only - research needed',32.5,-119.3,23),
  ('mc_redline','Redline Custom Contracting','luxury','developer','other','Unknown','Need Info','','','redlinecustomcontracting.com','Website only - research needed',32.5,-119.3,24),
  ('mc_bink','Bink Development','luxury','developer','other','Unknown','Need Info','','','binkdev.com','Website only - research needed',32.5,-119.3,25),
  ('mc_mwch','MWCH (MW Custom Homes)','luxury','developer','OC','Costa Mesa','To Vet','info@mwcustom.com','714-557-1325','mwcustom.com','',33.6411,-117.9187,26),
  ('mc_goodwin','Goodwin Homes','luxury','developer','other','Unknown','Web Form','','','landinga.goodwinhomes.com','Contact via website',32.5,-119.3,27),
  ('mc_laplaca','La Placa Group','luxury','developer','OC','Newport Beach','To Vet','info@laplaca.com','(949) 688-6898','laplaca.com','',33.6189,-117.9298,28),
  ('mc_revere','Revere','luxury','developer','OC','Newport Beach','Priority','Office@revererealestateco.com','520-548-0701','revererealestateco.com','Land Acq Step 1 - processes leads with land.',33.6189,-117.9298,29),
  ('mc_cefalia','Cefalia Development','luxury','developer','OC','Placentia','Priority','jeff@cefaliadevelopment.com','949-697-1955','cefaliadevelopment.com','Jeff Cefalia. Posts about teardowns. IG @jeffcefalia.',33.8722,-117.8703,30),
  ('mc_dubreville','Dubreville Atelier','luxury','developer','SD','San Diego','Priority','','','dubreville.com','Preston Dubreville. USD alum bond. IG @preston.dubreville.',32.7157,-117.1611,31),
  ('mc_dagan','Dagan Design & Construction','luxury','developer','SD','Rancho Santa Fe','Priority','','','dagandesignconstruction.com','Dagan Koffler. 114.5K IG, before/afters. IG @dagandesign.',33.0203,-117.2031,32),
  ('mc_arca','ARCA Builders','luxury','developer','OC','Newport Beach','Priority','','424-425-3838','arcabuilders.com','Jeremy Lepine. $700M JV background (CFO). IG @arca.builders.',33.6189,-117.9298,33),
  ('mc_nicholson','Nicholson Companies','luxury','developer','OC','Newport Beach','Priority','info@nicholsoncompanies.com','949-756-8393','nicholsoncompanies.com','Tom Nicholson. Builds CA + Hawaii.',33.6189,-117.9298,34),
  ('mc_stonehill','The Stonehill Company','luxury','developer','OC','Newport Beach','Priority','contact@thestonehillcompany.com','949-630-2196','thestonehillcompany.com','Joshua Zeyak. Services list Scrape and Rebuild.',33.6189,-117.9298,35),
  ('mc_julie','JL Design Build','luxury','developer','OC','Orange County','Priority','julie@julielaughton.com','714-305-2861','julielaughton.com','Julie Laughton. Mentor + podcast.',33.7175,-117.8311,36),
  ('mc_riviera','Riviera Building & Dev','luxury','developer','OC','Newport Beach','Priority','info@riviera-development.com','949-280-6788','riviera-development.com','Kyle Nelson. Public mobile, multi-market (OC+HI).',33.6189,-117.9298,37),
  ('mc_charco','Charco Design & Build','luxury','developer','SD','La Jolla','Priority','charco1@me.com','','','Armando Flores. 30+ yrs La Jolla, HGTV finalist.',32.8328,-117.2713,38),
  ('mc_daley','Daley Custom Homes','luxury','developer','SD','San Diego','To Vet','','','instagram.com/daley.jeff','Jeff Daley. Small brand, person direct. IG @daley.jeff.',32.7157,-117.1611,39)
ON CONFLICT ("id") DO NOTHING;
