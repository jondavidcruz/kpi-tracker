// 🗺 Niche market intelligence (Jon 2026-11-09) — the "where to hunt" brain for our focus niches.
//
// This is the sniper-play research: for each niche we care about, WHICH Florida areas are most
// likely to produce deals, the exact parcel pull filter (so we pull a laser-targeted list instead
// of a whole county), the leading indicators to watch (with sources), who the buyers are, and the
// spread math. Seeded 2026-11-09 from deep web research (see sources on each signal).
//
// Pure data — client-safe. Keyed to NICHES ids in land-niches.ts. Prices/figures are directional
// (mostly asking-price + public filings); verify against county sold-data before underwriting.
// Not every niche has intel yet — only the ones we're actively sharpening (waterfront, solar, data
// centers). The playbook card hides these sections for niches with no entry.

export type HuntArea = {
  area: string;
  tier: "primary" | "secondary" | "watch"; // primary = our repeatable target, secondary = high-$/fewer deals, watch = pipeline/early
  badge?: string;      // short nuance tag (e.g. "Trophy $4M+", "Duke", "Pipeline 1GW")
  water?: string;      // waterfront: canal / gulf / lake / river / ICW
  priceBand?: string;  // typical land price band
  why: string;
};
export type Signal = { label: string; url?: string };

export type NicheMarket = {
  nicheId: string;
  thesis: string;       // one-line why this niche + the edge
  economics: string;    // the spread angle
  areas: HuntArea[];
  avoid?: string[];     // penny-lot / wrong-fit places to skip
  signals: Signal[];    // leading indicators + where to watch
  pullFilter: string[]; // the sniper parcel filter
  buyers: string[];     // named FL buyers / archetypes to marry deals to
  updated: string;
  caveat?: string;
};

export const NICHE_MARKETS: Record<string, NicheMarket> = {
  // ────────────────────────────────────────────────────────────────────────────────────────
  waterfront: {
    nicheId: "waterfront",
    thesis: "Our proven play. Waterfront vacant lots that clear a >$50k floor, sold to custom/luxury & canal spec builders. Direct (no-fixed-bridge) water access is the single biggest value multiplier.",
    economics: "Penny-lot floor kills Lehigh-style junk. Gulf-access canal lots run ~$190k–$495k (Cape Coral), premium/point lots $400k–$2M, trophy coastal $2M–$10M (Naples, Ft. Lauderdale). Buy from motivated out-of-area owners, assign to builders who pay per front-foot, not per comp.",
    areas: [
      { area: "Cape Coral (Lee)", tier: "primary", badge: "Volume workhorse", water: "Canal → Gulf", priceBand: "$190k–$495k (premium $400k–$2M)", why: "Largest canal network in the hemisphere; deep active spec-builder base; cleared, seawalled lots. Verify GULF access — freshwater lots dip under $50k." },
      { area: "Punta Gorda Isles / Burnt Store Isles (Charlotte)", tier: "primary", badge: "Sailboat access", water: "Sailboat canal → Charlotte Harbor", priceBand: "$80k–$465k", why: "Deed-restricted, city water/sewer, no-bridge sailboat access to the Harbor. Retiree custom-build demand. (Burnt Store LAKES is freshwater — skip.)" },
      { area: "Marco Island (Collier)", tier: "primary", badge: "Last Gulf lots", water: "Finger canal, direct Gulf", priceBand: "$975k–$4.5M", why: "Last buildable Gulf-access lots in established neighborhoods; direct/no-bridge commands a big premium." },
      { area: "Apollo Beach (Hillsborough)", tier: "primary", badge: "Tampa metro", water: "Saltwater canal, bridge-free Bay/Gulf", priceBand: "$700k–$999k", why: "Tampa Bay growth; 300'-wide canals, bridge-free, no builder restrictions on the premium lots." },
      { area: "Palm Coast saltwater districts (Flagler)", tier: "primary", badge: "NE FL", water: "Saltwater canal → ICW", priceBand: "$150k–$575k", why: "Sailboat Country / Palm Harbor / Yacht Harbor Village; ICW/ocean access; canal homesites getting scarce." },
      { area: "Crystal River / Homosassa (Citrus)", tier: "primary", badge: "Nature Coast", water: "Saltwater canal, direct Gulf", priceBand: "$150k–$950k", why: "Spring-fed Gulf access, scalloping/boating draw; cheaper entry. Watch AE flood zones." },
      { area: "South Gulf Cove / Placida (Charlotte)", tier: "primary", badge: "Boca Grande halo", water: "Canal → ICW/Gulf", priceBand: "$260k–$459k (direct only)", why: "Mid-price Gulf-access waterfront. Filter HARD for direct access — interior SGC lots are $18–40k junk." },
      { area: "Naples — Port Royal / Aqualane / Royal Harbor (Collier)", tier: "secondary", badge: "Trophy $4M+", water: "Canal / Bay, direct Gulf", priceBand: "$4.75M–$10M+", why: "Highest land values on the FL Gulf coast; teardown/rebuild engine for $25M+ estates." },
      { area: "Ft. Lauderdale — Las Olas Isles (Broward)", tier: "secondary", badge: "Megayacht", water: "Finger canal, deep-water ocean", priceBand: "$1.7M–$30M", why: "Venice of America; megayacht dockage; ~40% of active waterfront listings are new construction selling fast." },
      { area: "Jupiter — Admirals Cove / PB Gardens (Palm Beach)", tier: "secondary", badge: "Deep-water gated", water: "ICW / deep-water canal", priceBand: "$5.75M–$17.5M", why: "Gated golf+marina; deepwater for 80–100' yachts; very scarce vacant inventory." },
      { area: "Sarasota — Siesta / Longboat Key (Sarasota)", tier: "secondary", badge: "Barrier island", water: "Bay / ICW / sailboat canal", priceBand: "$1.7M–$2.95M", why: "Barrier-island scarcity; seawall + sailboat (no fixed bridge) water; strong custom demand." },
      { area: "Islamorada / Upper Keys (Monroe)", tier: "secondary", badge: "ROGO permits", water: "Canal / ocean / bay", priceBand: "$849k–$2.0M", why: "Permit-ready + dock rights (ROGO scarcity) are the value; market avg ~$1.8M." },
      { area: "Treasure Coast — Sewall's Point / Stuart / Vero (Martin/IRC)", tier: "secondary", badge: "Yacht access", water: "Indian River / ICW", priceBand: "$2.0M–$6.0M", why: "Deep-water yacht access up to 100'; 'last expansive lots'; permitted-dock parcels premium." },
      { area: "Windermere — Butler Chain of Lakes (Orange)", tier: "secondary", badge: "Lakefront", water: "Freshwater ski/boat chain", priceBand: "$2.0M–$9.25M", why: "The true luxury lakefront play; Orlando HNW; 200–400' frontage estate sites." },
    ],
    avoid: [
      "Lehigh Acres (Lee) — the penny-lot archetype, $15k–$40k dry lots, chronic oversupply",
      "Burnt Store Lakes & Rotonda West interior (Charlotte) — freshwater/interior, $18–40k, looks like water, prices like a penny lot",
      "Interior Port Charlotte / North Port / Palm Bay — $11k–$46k dry platted inventory",
      "Port St. Lucie interior — builder-driven dry lots, heavy competition, not our waterfront niche",
      "Golden Gate Estates (Collier), Citrus Springs / Marion Oaks (Marion), Poinciana (Polk/Osceola) — massive dry platted lots, not waterfront",
    ],
    signals: [
      { label: "County Property Appraiser sold-data + dock/seawall permit spikes (Lee, Collier, Charlotte, Monroe, Flagler, Hillsborough, Sarasota, Martin)" },
      { label: "Luxury absorption tightening — ONE Sotheby's quarterly trends", url: "https://issuu.com/onesir" },
      { label: "Corcoran 'Inhabit' coastal/Miami luxury report", url: "https://inhabit.corcoran.com" },
      { label: "New-construction share of active waterfront listings rising (builders absorbing lots)" },
      { label: "'Last remaining / hard to find' scarcity language + falling active-lot counts per canal district" },
    ],
    pullFilter: [
      "Land use = Vacant Residential (FL DOR code 0000); for teardowns invert to improved SFR (0100) built <1985 with land/just-value > 0.6",
      "Waterfront flag = TRUE (appraiser attribute) OR spatial-join parcels within ~75 ft of a navigable canal/river/Gulf/ICW/lake; EXCLUDE freshwater drainage/retention",
      "Hard value gate: assessed just-value ≥ $50k (auto-kills Lehigh / Rotonda / Burnt Store Lakes penny lots)",
      "Lot size 0.15–1.0 ac (canal/coastal); 0.5–5+ ac (lakefront estate). Frontage ≥ 60 ft (80'+ for sailboat/premium)",
      "Prefer no-fixed-bridge / direct access (biggest value multiplier); capture FEMA flood zone (AE/VE expected, not a disqualifier)",
      "Owner skew: out-of-state/out-of-county, individual (not builder LLC), owned 10+ yrs, free & clear → motivated seller",
      "Blacklist ZIPs/subdivisions: Lehigh Acres, Burnt Store Lakes, Rotonda West interior, Golden Gate Estates, Citrus Springs, Marion Oaks, Poinciana",
    ],
    buyers: [
      "Cape Coral Gulf-access spec builders: Sposen Signature Homes, Banham Builder, Koogler",
      "Luxury/custom: London Bay Homes (Naples/Sarasota), Perrone Construction (Sarasota), SRD Building Corp (Port Royal), Neal Signature Homes (SW FL), Lee Wetherington Homes",
      "HNW end buyers via Premier Sotheby's, John R. Wood, Douglas Elliman, Nest Seekers, William Raveis",
      "Find more: pull building-permit records on vacant waterfront parcels — repeat contractor/grantee LLCs = your buyers",
    ],
    updated: "2026-11-09",
    caveat: "Price bands are mostly active-listing asking prices (2022–2026). Confirm with closed sales before offers.",
  },

  // ────────────────────────────────────────────────────────────────────────────────────────
  solar: {
    nicheId: "solar",
    thesis: "The 'be the only one' play. FL is the #3 solar state; FPL/NextEra, Duke, TECO + Origis/FMPA are on a multi-decade land grab for flat, cheap ag land near transmission. Utility plans through 2032 imply 278–333 sq mi of NEW land. Almost no wholesalers source for it.",
    economics: "Developers pay a premium over ag comps: FPL's identifiable buys avg ~$7,826/ac (a 10,330-ac Treasure Coast deal was ~$7,400/ac) vs ranch/pasture $2,500–$5,500/ac and timberland ~$2,500 — roughly +35–45% over ranch, ~3x over timber. Or lock an OPTION ($10–40/ac/yr) and assign to a developer; leases run ~$700–$2,000/ac/yr.",
    areas: [
      { area: "Manatee (Myakka City / SE)", tier: "primary", badge: "FPL cluster", priceBand: "~$7k–8k/ac exit", why: "FPL Long Creek, Three Creeks, Sambucus; FPL paid ~$30M for ~3,400 ac (2023). Flatford/Myakka are preferred sites in the 2025 Ten-Year Site Plan." },
      { area: "Hendry (LaBelle / Clewiston)", tier: "primary", badge: "FPL", why: "FPL Sawgrass + TYSP preferred sites (Swamp Cabbage, Cocoplum, LaBelle). Cheap ag/sugar land, strong transmission." },
      { area: "St. Lucie / Indian River (Treasure Coast)", tier: "primary", badge: "FPL", why: "FPL bought 10,330 ac of farmland for $76.7M (~$7,400/ac). FPL is 60% of St. Lucie's tangible-property tax roll. Sea Grape added 2026." },
      { area: "Polk (Central FL)", tier: "primary", badge: "Major hub", why: "A dozen+ utility-scale plants; Lakeland approved a 2,044-ac project on ex-phosphate land. Reclaimed mining land 'that can't be developed otherwise.'" },
      { area: "Okeechobee", tier: "primary", badge: "FPL", why: "FPL Fort Drum SEC; TYSP preferred sites Tangelo, Catfish. Ranch/pasture land." },
      { area: "Hillsborough (Apollo Beach)", tier: "secondary", badge: "TECO", why: "TECO home turf: Big Bend I/II, agrivoltaics + floating solar; Wimauma targeted Dec 2026." },
      { area: "Sumter + Columbia (Fort White)", tier: "secondary", badge: "Duke", why: "Duke Half Moon + Jumper Creek (Sumter), Price Creek 74.9 MW (Columbia, ~2027). Duke leases ranchland." },
      { area: "Madison / Jefferson / Hernando", tier: "secondary", badge: "Duke ~300 MW", why: "Duke Phase 1 (Sundance, Bailey Mill, Rattler) online ~summer 2026." },
      { area: "Levy / Putnam / Alachua", tier: "watch", badge: "Origis/FMPA", why: "Municipal portfolio: Whistling Duck 75 MW (Levy), Rice Creek (Putnam) + FPL Horizon (Alachua)." },
      { area: "NW Panhandle (Calhoun, Gadsden, Walton, Santa Rosa, Baker, Brevard)", tier: "watch", badge: "FPL buildout", why: "FPL built 12 plants in 7 of 12 NW counties in 2 yrs + 6 more scheduled." },
    ],
    signals: [
      { label: "Utility Ten-Year Site Plans (TYSP) — names preferred/potential solar sites BY COUNTY years ahead. Florida PSC", url: "https://www.floridapsc.com" },
      { label: "FPL 2026–2035 Ten-Year Site Plan (+ site maps PDF)", url: "https://www.fpl.com/content/dam/fplgp/us/en/about/pdf/ten-year-site-plan.pdf" },
      { label: "Interconnection queue tracker (projects with future COD = land already needed)", url: "https://www.interconnection.fyi" },
      { label: "EIA-860 operating + planned plant database", url: "https://www.eia.gov/electricity/data/eia860/" },
      { label: "County commission conditional-use / special-exception agendas (a CU application = developer has site control NOW)" },
      { label: "FPL / Duke / TECO newsrooms for construction-start + COD announcements", url: "https://newsroom.fpl.com" },
    ],
    pullFilter: [
      "Land use = FL DOR agricultural band 50–69: cropland (51–53), timberland (54–59), grazing/pasture (60–65), groves/citrus (66, declining-citrus angle); plus vacant rural (00/10, 99)",
      "Acreage 150–1,500 ac, prioritize 400–1,000 contiguous; flag adjacent same-owner parcels for assembly",
      "Within ~2 mi of a transmission line (138 kV+) AND ~2 mi of a substation (gen-tie costs ~$1–3M/mile — distance kills it)",
      "Flat (FL default), low wetland coverage (<50% NWI), not in floodway; exclude conservation (85–89)",
      "Owner skew: individuals/family trusts/estates with large ag acreage, aging cattle/citrus operations, absentee rural owners",
      "EXCLUDE parcels already owned by utilities/known solar buyers (FPL, Duke, TECO, Origis, NextEra) — already taken",
      "Tier-up: cross-reference hits against TYSP preferred/potential site maps + county CU agendas = bullseye",
    ],
    buyers: [
      "Utilities (buy & own land): FPL/NextEra (largest FL buyer), Duke Energy Florida (leases + buys), Tampa Electric/TECO, OUC",
      "Most active independent developer in FL: Origis Energy (paired with FMPA municipal portfolio)",
      "Other IPPs/aggregators: Savion, Altus Power, Civic Renewables, TPG (land aggregator)",
      "Key broker/comp & potential partner: SVN | Saunders Ralston Dantzler (Dean Saunders) — brokers big tracts to FPL; publishes the annual 'Lay of the Land' FL land-price report",
    ],
    updated: "2026-11-09",
    caveat: "Hard anchors = TYSP filings, EIA-860, and SVN's Lay of the Land report. Re-pull the current TYSP before targeting — Duke county/phase assignments shift between filings.",
  },

  // ────────────────────────────────────────────────────────────────────────────────────────
  data_center: {
    nicheId: "data_center",
    thesis: "Highest-ROI, down-the-line. FL has ~900 MW operating (legacy Miami) but a massive rural pipeline — 20+ hyperscale/AI campuses proposed since 2024 on cheap ex-phosphate/citrus/ranch land. The market is POWER-constrained, not land-constrained (FPL reports ~21 GW of large-load interest). Buy raw land near transmission BEFORE the developer/utility arrives.",
    economics: "Buyers pay for POWER, not dirt. Power-ready land trades at a huge multiple of ag comps: TX power-ready ~$800k/ac vs $2.5k–$10k/ac raw; land within ½ mi of a substation trades ~2x sites 2–5 mi away; buyers pay ~$150k–$400k per MW of confirmed capacity. FL interior ag is low-thousands to ~$15–30k/ac — a potential 10x–100x repricing on exit. The edge is spotting power-adjacency before the market.",
    areas: [
      { area: "Polk (Fort Meade, Haines City)", tier: "primary", badge: "Pipeline 1GW+", why: "Fort Meade campus ~1,100–1,330 ac, 1+ GW, $2.6–2.8B (PUD approved). Cielo Haines City 74 ac/300 MW. Ex-phosphate = huge contiguous parcels near Duke's Hines complex." },
      { area: "St. Lucie (Fort Pierce)", tier: "primary", badge: "Atlas Compute", why: "Atlas Compute 240 MW→1 GW at Midway Industrial Park (ex-citrus). (Project Jarvis ~1,218 ac/$13.5B was withdrawn Feb 2026 — volatile.)" },
      { area: "DeSoto (Arcadia)", tier: "primary", badge: "Behind-the-meter gas", why: "DCIP Group complex on a decommissioned power-plant site; 34 ac rezoned Mar 2026, tracker lists up to 4,000 MW on Florida Gas Transmission gas. Strong local backlash." },
      { area: "Palm Beach (Loxahatchee / Arden)", tier: "secondary", badge: "Project Tango", why: "~202 ac, ~600 MW, up to 3.7M sqft near FPL West County Energy Center. Repeatedly delayed on local opposition." },
      { area: "Miami-Dade (Doral / Airport West)", tier: "secondary", badge: "Operating", why: "FL's largest existing market (Equinix NAP of the Americas, 40+ subsea cables). Land-scarce + expensive — small infill/edge only." },
      { area: "Citrus County", tier: "watch", badge: "Early entitlement", why: "Deltona Corp. comp-plan amendment on ~813 ac." },
      { area: "Nassau (near JAX airport)", tier: "watch", badge: "NextNRG", why: "1,600 ac (400 DC / 1,200 energy) + up to 6,000 ac expansion; hybrid gas/solar/storage, modular buildout." },
      { area: "Interior I-4 corridor (Osceola / Polk)", tier: "watch", badge: "Emerging", why: "Multiple tracker entries; watch FPL/Duke territory with 2026–28 energization." },
    ],
    signals: [
      { label: "FPL large-load forecast (8 GW by 2032; ~21 GW interest) — first large-load deal expected end-2026", url: "https://www.datacenterdynamics.com/en/news/nextera-raises-data-center-forecast-to-8gw-by-2032-at-florida-subsidiary-fpl/" },
      { label: "Florida PSC dockets + Ten-Year Site Plans (new MW location)", url: "https://www.floridapsc.com" },
      { label: "Interconnection queue (large-load requests)", url: "https://www.interconnection.fyi" },
      { label: "County comp-plan amendments & rezonings to industrial / 'data center' use — earliest public land signal" },
      { label: "FL data-center trackers (149 sites / ~892 MW)", url: "https://dcmap.us/states/florida/" },
      { label: "Moratoria watch (negative signal — a 12-mo DC moratorium passed in ≥1 county Sep 2026)", url: "https://www.datacenterbans.com/state/florida" },
    ],
    pullFilter: [
      "TIER 1 hard gates: acreage ≥100 ac (sweet spot 150–1,500; land-bank ≥1,000)",
      "Zoning industrial/heavy-industrial OR ag/vacant/phosphate/timber with a comp-plan path",
      "Within ~1 mi of a 138kV–500kV transmission line AND ~5–10 mi of a substation (prefer known spare capacity per TYSP)",
      "Exclude FEMA SFHA (A/AE/V) and wetlands-dominant parcels",
      "TIER 2 adds: ≥2 long-haul fiber routes within ~5 mi; permittable water (cooling); near Florida Gas Transmission for behind-the-meter gas; single-owner contiguous",
      "Owner skew: ag/ranch/timber corps, phosphate/mining (Mosaic-type), citrus estates, land trusts, decommissioned power-plant owners, absentee institutional ag",
      "Geo-weight: Polk, St. Lucie, DeSoto, Citrus, Osceola, Nassau + interior I-4 over land-scarce Miami-Dade",
    ],
    buyers: [
      "FL-project developers: Stonebridge/Bohler (Fort Meade), Cielo Digital (Haines City), Atlas Compute (Fort Pierce), PBA Holdings (Tango), DCIP Group (DeSoto), NextNRG (Nassau), Deltona Corp. (Citrus)",
      "FL colocation: Equinix, Digital Realty, EdgeConneX, DataBank, Iron Mountain, Cologix, QTS",
      "Utilities as partners/buyers: Duke Energy FL (exploring its own DCs), FPL/NextEra (driving the large-load rush)",
      "Watch for FL entry: AWS, Google, Meta, Microsoft, Vantage, Tract, Edged, CloudHQ — flag any 'Project [codename]' shell LLC filing a FL site plan",
    ],
    updated: "2026-11-09",
    caveat: "Pure pipeline/land-banking window (no operating hyperscale DC in FL yet) = high entitlement/political risk: moratoria, rejections, and withdrawals all happened in 2026. MW/acreage figures conflict across sources — verify against county records.",
  },
};

export function nicheMarket(id: string): NicheMarket | undefined {
  return NICHE_MARKETS[id];
}
