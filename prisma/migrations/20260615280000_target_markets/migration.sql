-- Target markets (heat-tiered counties + neighborhoods + developer buy boxes).
CREATE TABLE IF NOT EXISTS "TargetMarket" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT '',
    "tier" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL DEFAULT '',
    "neighborhoods" TEXT NOT NULL DEFAULT '',
    "developers" TEXT NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TargetMarket_pkey" PRIMARY KEY ("id")
);

INSERT INTO "TargetMarket" ("id","name","region","tier","score","summary","neighborhoods","developers","lat","lng","sortOrder") VALUES
(
  'tm_oc','Orange County, CA','OC','S',1319,
  'Tier S — Priority #1. 1,319 sold; 109 sales over $10M in 2025. Newport median $4.05M (+18% YoY); CdM ~$5M. Coastal Commission friction = margin.',
  '92625 Corona del Mar — CdM Village, Cameo Shores, Cameo Highlands, Shore Cliffs, Irvine Terrace
92660 Newport (interior) — Newport Heights, Cliffhaven, Westcliff, Dover Shores, Eastbluff, Big Canyon, Bayshores
92657 Newport Coast — Pelican Hill, Pelican Crest, Pacific Ridge (ridge-view rebuilds $10M+)
92651 Laguna Beach — North Laguna, Three Arch Bay, Emerald Bay, Top of the World, Mystic Hills, Bluebird Canyon
92661/92662 Balboa Peninsula & Island — Peninsula Point, Balboa Island, Lido Isle (30x80 lots)
92663 West Newport / Lido — Newport Shores, Lido Isle
92629 Dana Point — Monarch Beach, Niguel Shores, Lantern District
92677 Laguna Niguel — Bear Brand Ranch, Monarch Point
92602/92603 N. Tustin / Lemon Heights / Turtle Rock — half-acre+ ranch teardowns
92861 Villa Park — half-acre lots, ranch teardowns',
  'Patterson Custom Homes — Newport/CdM/Dana Point; 50x100+ lot, $3M+ ARV
Thomas James Homes — R-1 lots 5,500+ sqft, ARV $3M+, fast cycle (most active single-lot buyer)
Brandon Architects — Newport/CdM; pairs with Patterson; modern coastal
McKinley Homes — Newport/Irvine; 7,000+ sqft lots, no view restrictions
Spinnaker Development — Newport/CdM coastal; smaller lot OK on peninsula
Pinnacle Custom Homes — OC luxury; $5M+ end product',
  33.6189,-117.9298,1
),
(
  'tm_nashville','Nashville, TN','TN','1',560,
  'Tier 1 — Priority #2. 560 sold; Belle Meade median $2.75M. Best volume-to-friction ratio: fast permits, no coastal commission, deep developer pool.',
  '37205 Belle Meade / West Meade / Hillwood — half-acre+ ranch teardowns
37215 Green Hills / Forest Hills / Oak Hill — densest new-build cluster; 57 closings $3M+ / 12mo
37204 Berry Hill / Melrose / Wedgewood-Houston — Granny White corridor; $4M+ new builds
37212 Hillsboro / Belmont / 12 South — tight infill; $2-5M
37209 Sylvan Park / The Nations — heaviest mid-tier teardown; 50-ft lots
37206 East Nashville (Lockeland Springs, Edgefield) — emerging $2M+ pockets
37027 Brentwood (Davidson side) — large-lot estate teardowns',
  'Castle Homes — Belle Meade/Green Hills/Brentwood; half-acre+, $3M+ ARV
Build Nashville — Sylvan Park/Green Hills; 50x150 OK, $2M+ ARV
Britt Development Group — historic overlay districts; restoration + new build
Bell Construction — 37205/37215/37212; estate custom, large lot
Turnberry Homes — 37205/37215/Brentwood; $2.5M+ custom + production
The Magness Group — 12 South/Belmont; urban infill modern, 50x150 OK
McKay Co. — The Nations/West Nashville; mid-luxury infill $2-3M, high volume',
  36.1064,-86.8295,2
),
(
  'tm_sd','San Diego, CA','SD','2',137,
  'Tier 2 — Priority #3. 137 sold; 68% cash buyers; 35% international above $3M. New construction only 2-3% of sales = tight inventory, fat margins.',
  '92037 La Jolla — Bird Rock, Muirlands, La Jolla Shores, Country Club, Hidden Valley, Beach Barber Tract, Windansea (#1 SD teardown zip)
92067 Rancho Santa Fe (Covenant) — estate $10M+ rebuilds
92014 Del Mar / Carmel Valley — Olde Del Mar, Beach Colony, Del Mar Heights, Crest Canyon
92118 Coronado — Village, Cays, Shores (cash + military)
92106/92107 Point Loma / Sunset Cliffs / OB — La Playa, Sunset Cliffs, Wooded Area, Loma Portal, Roseville-Fleetridge
92103 Mission Hills / Bankers Hill — canyon/view lots, 1920s-50s teardowns
92075/92024 Solana Beach / Encinitas — Old Encinitas, Leucadia, Beach Colony fringe
92127/92091 Santaluz / Fairbanks Ranch — inland estate communities',
  'Thomas James Homes — La Jolla/Del Mar/Encinitas/Point Loma/Coronado; R-1 5,500+ sqft, ARV $2.5M+
Wardell Builders — La Jolla/Point Loma/RSF/Coronado/Solana Beach; half-acre coastal
Davidson Communities — coastal SD/RSF/North County; finished lots + redevelopment
McMillin (Cornerstone) — coastal North County; master-planned + infill
Reside Custom Homes — La Jolla/Del Mar/Coronado; boutique, flex on lot if premium
Wakeland Housing & Dev — urban infill, mixed use + select luxury',
  32.8328,-117.2713,3
),
(
  'tm_honolulu','Honolulu, HI','HI','3',62,
  'Tier 3 — Niche / big per-deal. 62 sold; 8 sales $10M+ in 2024; top sale $26M. Fee-simple only; leasehold = pass.',
  '96816 Kahala / Diamond Head / Black Point — Kahala Ave oceanfront $20M+; interior streets = teardown hunt
96821 Hawaii Loa Ridge / Waialae Iki / Aina Haina — 1950s-70s stock
96825 Hawaii Kai / Portlock — Portlock oceanfront row (record $42M); marina lots 1960s-70s
96822 Manoa / Makiki Heights / Tantalus — mid-century view lots; $3-6M rebuilds
96813 Nuuanu / Pacific Heights / Alewa Heights — view-ridge teardowns
96734 Kailua / Lanikai — windward; #1 luxury rebuild zip ($26M record)',
  'Pyramid Premier Properties — Kahala specialist (40+ homes); fee-simple 7,500+ sqft, $5M+ ARV
Graham Builders — Oahu (Kahala/Hawaii Kai/Manoa); 10,000+ sqft preferred
Homeworks Construction — Oahu-wide (750+ projects); smaller lots OK if premium
H-1 Construction — Oahu & outer islands; mid-luxury
Tall Builders LLC — Oahu boutique custom; flexible on lot
Long Bay Builders — Kahala/Diamond Head/Black Point; $5M+ ARV, oceanfront',
  21.2769,-157.7811,4
)
ON CONFLICT ("id") DO NOTHING;

-- Enrich key developers' target areas + buy boxes so the area search matches.
UPDATE "MarketContact" SET "buyBoxAreas"='Newport Beach, Corona del Mar, Dana Point', "buyBox"='50x100+ lot, $3M+ ARV, value-engineering ready' WHERE "id"='mc_patterson';
UPDATE "MarketContact" SET "buyBoxAreas"='OC coastal + inland; La Jolla, Del Mar, Encinitas, Point Loma, Coronado', "buyBox"='R-1 lots 5,500+ sqft, ARV $2.5M+, fast 12-mo cycle' WHERE "id"='mc_tjh';
UPDATE "MarketContact" SET "buyBoxAreas"='Newport, Corona del Mar (peninsula/island OK)' WHERE "id"='mc_spinnaker';
UPDATE "MarketContact" SET "buyBoxAreas"='La Jolla, Point Loma, Rancho Santa Fe, Coronado, Solana Beach', "buyBox"='Half-acre coastal preferred; canyon lots OK' WHERE "id"='mc_wardell';
UPDATE "MarketContact" SET "buyBoxAreas"='Newport, Corona del Mar, Laguna' WHERE "id"='mc_gonterman';
UPDATE "MarketContact" SET "buyBoxAreas"='Coronado, La Jolla, Encinitas' WHERE "id"='mc_tourmaline';
UPDATE "MarketContact" SET "buyBoxAreas"='La Jolla, Del Mar, Coronado' WHERE "id"='mc_charco';
UPDATE "MarketContact" SET "buyBoxAreas"='Rancho Santa Fe, Del Mar, Encinitas' WHERE "id"='mc_dagan';
UPDATE "MarketContact" SET "buyBoxAreas"='Rancho Santa Fe (Covenant)' WHERE "id"='mc_nuevo';
UPDATE "MarketContact" SET "buyBoxAreas"='Laguna, CdM, Lido, Balboa Peninsula' WHERE "id"='mc_julie';

-- Seed the markets list + universal acquisition filter into marketing settings (if blank).
UPDATE "Settings" SET "marketingMarkets"='Orange County, CA (Tier S)
Nashville, TN (Tier 1)
San Diego, CA (Tier 2)
Honolulu, HI (Tier 3)' WHERE "id"=1 AND "marketingMarkets"='';
UPDATE "Settings" SET "marketingResearch"='Universal acquisition filter (all markets): built 1940-1979, R-1 zoning; lot >= 0.20 acre coastal / >= 0.40 acre estate; owner 15+ yrs OR absentee OR probate; existing structure under 2,500 sqft (signals demo); confirm no historic designation, no coastal overlay (CA), fee simple (HI). Data: Zillow sold $2M+, built 2021+; volume rank sets the tier.' WHERE "id"=1 AND "marketingResearch"='';
