// 🎯 Land-niche playbook (Jon 2026-11-09) — the strategy brain behind "sell the use, not the dirt."
//
// Everyone wholesales infill lots, so the spread is thin. Spread lives in three places:
//   1) scarcity (waterfront, in-path-of-growth, power-adjacent dirt)
//   2) hidden complexity (parcel can be split / rezoned / entitled and the seller can't see it)
//   3) a buyer who values the land for a USE the comps don't reflect (storage, solar, MH, data center)
//
// This file is the single source of truth for: the land-type taxonomy, the buyer archetypes we
// marry each type to, the buy-box template per type, the spread band, a 1–5 scorecard (so we can
// rank which niche to attack first), and the leading indicator / "where to look" pull filter.
//
// Pure data — client-safe, no server imports. Scores are directional judgment, not verified data
// (same caveat as the homework table they came from). Refine them as we actually transact.

export type Scores = {
  startSpeed: number;   // 5 = can start today with our current pull-and-assign motion
  buyerAccess: number;  // 5 = buyers are easy to find & reach from how we already source
  spread: number;       // 5 = very high $ spread potential per deal
  simplicity: number;   // 5 = low capital / low complexity / few moving parts
  studyValue: number;   // 5 = great topic for a market report that impresses big buyers (not in the do-first score)
};

export type BuyBoxField = { field: string; example: string };

export type Niche = {
  id: string;
  label: string;
  emoji: string;
  tagline: string;
  commodity?: boolean;      // the thin-spread baseline everyone already does
  buyerTypes: string[];     // archetype ids (see BUYER_ARCHETYPES)
  buyBox: BuyBoxField[];    // what a parcel needs to qualify for this use
  spreadTier: "low" | "medium" | "medium-high" | "high" | "very-high";
  spreadRange: string;      // directional $ per deal
  spreadWhy: string;        // where the spread comes from
  scores: Scores;
  leadingIndicator: string; // the signal that tells us this niche is hot in a market
  whereToLook: string;      // the pull filter — how we find the parcel
  note?: string;
};

// ── Buyer archetypes (idea #2: a reusable buy-box schema per buyer type) ──────────────────────
export type BuyerArchetype = {
  id: string;
  label: string;
  emoji: string;
  who: string;
  reachVia: string;         // how we find & contact them
  buyBoxCares: string[];    // the fields THIS buyer type actually screens on
};

export const BUYER_ARCHETYPES: BuyerArchetype[] = [
  { id: "spec_builder", label: "Spec / custom builder", emoji: "🔨", who: "Local builders putting up 1–20 homes a year", reachVia: "Permits, builder associations, Sales Nav, IG", buyBoxCares: ["Lot size", "Zoning / density", "Utilities to site", "Finished-home comps", "$/lot"] },
  { id: "waterfront_builder", label: "Luxury / waterfront builder", emoji: "🛥️", who: "High-end custom builders & HNW end-buyers", reachVia: "Luxury agents, yacht/marina networks, referrals", buyBoxCares: ["Water frontage", "Dock/seawall rights", "View", "Lot size", "$/front-foot"] },
  { id: "production_builder", label: "Production / subdivision builder", emoji: "🏘️", who: "Regional & national track builders (incl. DR Horton tier)", reachVia: "Land-acquisition managers, broker land teams", buyBoxCares: ["Acreage", "Entitlement status", "Density", "Utilities", "Absorption / rooftops"] },
  { id: "land_banker", label: "Land banker / land fund", emoji: "🏦", who: "Funds holding dirt ahead of growth", reachVia: "Fund acq desks, land brokers", buyBoxCares: ["Path of growth", "Acreage", "Entitlement upside", "Hold horizon", "$/acre basis"] },
  { id: "storage_operator", label: "Storage / RV-boat yard operator", emoji: "🚤", who: "Self-storage & outdoor RV/boat-storage operators", reachVia: "Google Maps + Sales Nav (log like the dev list)", buyBoxCares: ["2–10 ac", "Commercial/industrial zoning", "Interstate access", "Visibility", "Grade/drainage"] },
  { id: "mh_operator", label: "MH / RV-park operator or REIT", emoji: "🏕️", who: "Park operators & REITs actively consolidating", reachVia: "Park-owner lists, MHI network, broker park teams", buyBoxCares: ["MH zoning / density", "Acreage", "Utility capacity", "Pad count potential", "Flood zone"] },
  { id: "industrial_dev", label: "Flex / industrial / warehouse dev", emoji: "🏭", who: "Developers of flex, warehouse, truck/trailer parking", reachVia: "CRE brokers (industrial), econ-dev offices", buyBoxCares: ["Acreage", "Industrial zoning", "Interstate/port access", "Power", "Truck access"] },
  { id: "retail_pad_dev", label: "Retail pad developer", emoji: "🏪", who: "QSR, c-store, grocery-anchored pad developers", reachVia: "Net-lease brokers, franchise RE teams", buyBoxCares: ["Corner/arterial frontage", "Traffic counts", "Rooftops nearby", "Commercial zoning", "Pad size"] },
  { id: "solar_dev", label: "Solar developer / IPP", emoji: "☀️", who: "Utility-scale solar developers & independent power producers", reachVia: "FPSC filings, EIA, solar-dev land scouts", buyBoxCares: ["50–500+ ac", "Flat & cleared", "Distance to transmission/substation", "Interconnection capacity", "Lease $/ac/yr"] },
  { id: "datacenter_dev", label: "Data-center developer / hyperscaler", emoji: "🖥️", who: "Hyperscalers & DC developers", reachVia: "Site-selection consultants, utility econ-dev", buyBoxCares: ["Large acreage", "Power availability (MW)", "Fiber", "Water", "Substation proximity"] },
  { id: "ag_timber_investor", label: "Ag / timber investor", emoji: "🌲", who: "Ag operators, timber & land funds", reachVia: "Land brokers, ag networks, timber REITs", buyBoxCares: ["Acreage", "Soil / timber stand", "Water rights", "Access", "$/acre"] },
  { id: "mitigation_banker", label: "Mitigation banker", emoji: "🪷", who: "Wetland/species credit bankers & devs needing offsets", reachVia: "Mitigation-bank operators, enviro consultants", buyBoxCares: ["Wetland / habitat value", "Watershed / service area", "Acreage", "Restoration potential"] },
];

// ── The 12 Florida land niches ────────────────────────────────────────────────────────────────
export const NICHES: Niche[] = [
  {
    id: "infill_residential", label: "Infill residential lot", emoji: "🏠", commodity: true,
    tagline: "The commodity everyone wholesales — your baseline, not your edge.",
    buyerTypes: ["spec_builder", "production_builder"],
    buyBox: [{ field: "Lot size", example: "¼–½ acre buildable" }, { field: "Zoning", example: "Residential, utilities available" }, { field: "Comps", example: "Clear finished-home comps" }],
    spreadTier: "low", spreadRange: "$3k–15k", spreadWhy: "Transparent comps, max competition — a pure commodity.",
    scores: { startSpeed: 5, buyerAccess: 5, spread: 1, simplicity: 5, studyValue: 1 },
    leadingIndicator: "Permit volume + active spec builders in the ZIP",
    whereToLook: "Vacant residential-zoned lots with utilities — what we already pull.",
    note: "Keep doing it for cash flow, but it's not where the margin is.",
  },
  {
    id: "teardown_redev", label: "Teardown / redevelopment", emoji: "🧱",
    tagline: "The dirt is worth more than the old house sitting on it.",
    buyerTypes: ["spec_builder", "production_builder"],
    buyBox: [{ field: "Structure", example: "Old / low-value home on high-value land" }, { field: "Density", example: "Zoning allows more units than exist" }, { field: "Location", example: "Appreciating / in-path neighborhood" }],
    spreadTier: "medium", spreadRange: "$10k–40k", spreadWhy: "You price the land's future use, not the tired house on it.",
    scores: { startSpeed: 4, buyerAccess: 4, spread: 3, simplicity: 4, studyValue: 2 },
    leadingIndicator: "Rising land-to-improvement value ratio; new builds replacing old stock",
    whereToLook: "Low improvement value vs land value; older year-built in hot submarkets.",
  },
  {
    id: "subdividable_acreage", label: "Subdividable acreage (\"split\")", emoji: "✂️",
    tagline: "Buy one parcel, sell the entitlement upside of several lots.",
    buyerTypes: ["production_builder", "land_banker", "spec_builder"],
    buyBox: [{ field: "Acreage", example: "5–40 acres" }, { field: "Zoning / density", example: "Allows multiple buildable lots" }, { field: "Access", example: "Road frontage / easement in place" }, { field: "Utilities", example: "Water/sewer reachable" }],
    spreadTier: "high", spreadRange: "$25k–100k+", spreadWhy: "You sell the split upside the seller never priced in.",
    scores: { startSpeed: 3, buyerAccess: 4, spread: 4, simplicity: 3, studyValue: 3 },
    leadingIndicator: "Active subdivision approvals; builders buying acreage ahead of rooftops",
    whereToLook: "5–40 ac parcels, road frontage, density that pencils for a split.",
  },
  {
    id: "waterfront", label: "Waterfront / canal / lakefront", emoji: "🌊",
    tagline: "Pure scarcity — the Florida premium we're already positioned for.",
    buyerTypes: ["waterfront_builder", "spec_builder"],
    buyBox: [{ field: "Frontage", example: "Canal / lake / intracoastal water frontage" }, { field: "Rights", example: "Dock / seawall / navigable access" }, { field: "Lot size", example: "Buildable envelope above flood" }],
    spreadTier: "high", spreadRange: "$25k–150k+", spreadWhy: "Scarcity + HNW buyers who pay per front-foot, not per comp.",
    scores: { startSpeed: 5, buyerAccess: 4, spread: 4, simplicity: 4, studyValue: 2 },
    leadingIndicator: "Luxury absorption holding through rate cycle; low waterfront inventory",
    whereToLook: "Parcels touching water in our target wealth markets (already our lean).",
    note: "Our existing target markets already skew here — easiest high-spread extension.",
  },
  {
    id: "rv_boat_storage", label: "Outdoor RV / boat storage", emoji: "🚤",
    tagline: "Fast buyer access, FL demand, low build cost — the best first move.",
    buyerTypes: ["storage_operator", "industrial_dev"],
    buyBox: [{ field: "Acreage", example: "2–10 acres" }, { field: "Zoning", example: "Commercial / industrial (or allows outdoor storage)" }, { field: "Location", example: "Near I-10 / I-75 / I-4 / I-95" }, { field: "Site", example: "Good grade & drainage, visible" }],
    spreadTier: "medium-high", spreadRange: "$15k–60k", spreadWhy: "Use-value far above raw-land comps; operators move fast.",
    scores: { startSpeed: 5, buyerAccess: 5, spread: 3, simplicity: 4, studyValue: 3 },
    leadingIndicator: "RV/boat registrations + storage waitlists; new storage permits near interstates",
    whereToLook: "2–10 ac commercial/industrial parcels near interstate interchanges.",
    note: "Same pull-and-assign motion we already run. Start here.",
  },
  {
    id: "commercial_pad", label: "Commercial / industrial pad", emoji: "🏢",
    tagline: "Income-use pricing on arterials and interstate frontage.",
    buyerTypes: ["industrial_dev", "retail_pad_dev"],
    buyBox: [{ field: "Acreage", example: "2–10 acres" }, { field: "Frontage", example: "Arterial / interstate visibility" }, { field: "Zoning", example: "Commercial / industrial" }, { field: "Access", example: "Curb cuts / truck access" }],
    spreadTier: "high", spreadRange: "$25k–100k+", spreadWhy: "Priced on the income the use throws off, not land comps.",
    scores: { startSpeed: 3, buyerAccess: 3, spread: 4, simplicity: 3, studyValue: 3 },
    leadingIndicator: "Rooftop growth + traffic counts; new retail/flex permits on the corridor",
    whereToLook: "Commercial-zoned 2–10 ac on arterials and near interchanges.",
  },
  {
    id: "mh_rv_park", label: "Manufactured-home / RV-park land", emoji: "🏕️",
    tagline: "Operators & REITs are consolidating hard and easy to reach.",
    buyerTypes: ["mh_operator", "land_banker"],
    buyBox: [{ field: "Zoning", example: "MH-zoned, or density allows a park" }, { field: "Acreage", example: "5+ acres, pad-count potential" }, { field: "Utilities", example: "Water/sewer capacity or septic ok" }, { field: "Flood", example: "Out of high-risk flood where possible" }],
    spreadTier: "high", spreadRange: "$25k–100k+", spreadWhy: "Density + cash-flow math the raw-land comps ignore.",
    scores: { startSpeed: 4, buyerAccess: 4, spread: 4, simplicity: 3, studyValue: 4 },
    leadingIndicator: "Park REIT acquisition activity; lot-rent growth in the metro",
    whereToLook: "MH-zoned parcels or density that supports a park; check zoning FIRST.",
    note: "Zoning & density vary by county — verify before you contract.",
  },
  {
    id: "solar", label: "Solar / utility-scale", emoji: "☀️",
    tagline: "Highest $/acre, long timeline — the report play that wins big buyers.",
    buyerTypes: ["solar_dev", "land_banker"],
    buyBox: [{ field: "Acreage", example: "50–500+ acres" }, { field: "Terrain", example: "Flat, cleared, low slope" }, { field: "Grid", example: "Close to transmission line / substation" }, { field: "Capacity", example: "Interconnection capacity available" }],
    spreadTier: "very-high", spreadRange: "$100k+ (option/lease assignable)", spreadWhy: "Per-acre option/lease value dwarfs ag comps; FPL/Duke very active.",
    scores: { startSpeed: 2, buyerAccess: 3, spread: 5, simplicity: 2, studyValue: 5 },
    leadingIndicator: "FPSC interconnection queue + EIA solar buildout near substations",
    whereToLook: "Large flat parcels within a few miles of transmission/substations.",
    note: "Study & report first — document one buyer's spec, then use it as a buy box.",
  },
  {
    id: "data_center", label: "Data-center land", emoji: "🖥️",
    tagline: "Very-high value, almost no supply — power is everything.",
    buyerTypes: ["datacenter_dev", "land_banker"],
    buyBox: [{ field: "Acreage", example: "Large contiguous parcel" }, { field: "Power", example: "MW-scale availability / near substation" }, { field: "Fiber", example: "Fiber routes present" }, { field: "Water", example: "Cooling water access" }],
    spreadTier: "very-high", spreadRange: "$100k+ (rare, specialized)", spreadWhy: "A use almost no land qualifies for; buyers pay for the site.",
    scores: { startSpeed: 1, buyerAccess: 1, spread: 5, simplicity: 1, studyValue: 5 },
    leadingIndicator: "Utility substation expansions; hyperscaler site-selection activity in FL",
    whereToLook: "Large parcels with power + fiber + water near substations.",
    note: "Few deals, very specialized. Research for credibility; transact opportunistically.",
  },
  {
    id: "ag_timber", label: "Agricultural / timber", emoji: "🌲",
    tagline: "Scale and long holds — strong study value, slower cash.",
    buyerTypes: ["ag_timber_investor", "land_banker"],
    buyBox: [{ field: "Acreage", example: "Large tracts" }, { field: "Soil / stand", example: "Productive soil or timber stand" }, { field: "Water", example: "Water rights / irrigation" }, { field: "Access", example: "Legal & physical access" }],
    spreadTier: "medium", spreadRange: "$15k–60k", spreadWhy: "Volume & basis play more than per-deal spread.",
    scores: { startSpeed: 2, buyerAccess: 3, spread: 2, simplicity: 2, studyValue: 4 },
    leadingIndicator: "Timber/ag commodity pricing; land-fund acquisition activity",
    whereToLook: "Large ag/timber tracts with clean access and water.",
  },
  {
    id: "mitigation", label: "Wetland / conservation mitigation", emoji: "🪷",
    tagline: "Environmental value becomes credit value — FL is wetland-heavy.",
    buyerTypes: ["mitigation_banker", "land_banker"],
    buyBox: [{ field: "Habitat", example: "Wetland / species / restoration value" }, { field: "Service area", example: "In a bank's watershed / service area" }, { field: "Acreage", example: "Enough to generate credits" }, { field: "Restorability", example: "Can be restored / preserved" }],
    spreadTier: "high", spreadRange: "$25k–100k+", spreadWhy: "Credit-program value the open market never reflects.",
    scores: { startSpeed: 1, buyerAccess: 2, spread: 4, simplicity: 1, studyValue: 5 },
    leadingIndicator: "Mitigation-bank demand + development pressure needing offsets",
    whereToLook: "Environmentally-valuable land inside active mitigation service areas.",
    note: "Niche & technical — partner with a mitigation banker to learn the rules.",
  },
  {
    id: "entitlement", label: "Entitlement / rezoning play", emoji: "📐",
    tagline: "You create the value — the highest spread and the most work.",
    buyerTypes: ["production_builder", "industrial_dev", "land_banker"],
    buyBox: [{ field: "Upside", example: "Zoning change unlocks a higher use" }, { field: "Feasibility", example: "Realistic approval path" }, { field: "Control", example: "Long enough contract / option to entitle" }],
    spreadTier: "very-high", spreadRange: "$50k–200k+", spreadWhy: "You sell the entitled value, not the raw dirt.",
    scores: { startSpeed: 2, buyerAccess: 3, spread: 5, simplicity: 1, studyValue: 4 },
    leadingIndicator: "Favorable comp-plan / rezoning approvals; municipalities encouraging density",
    whereToLook: "Parcels where a rezone/entitlement unlocks a materially higher use.",
    note: "Highest risk — needs options, timelines, and local approval know-how.",
  },
];

// ── Do-first score (idea #4: rank which niche to attack) ──────────────────────────────────────
// Weighted: spread matters most, then how fast we can start & reach buyers, then simplicity.
// studyValue is shown but NOT scored (it's about looking smart, not about closing fast).
export function attackScore(s: Scores): number {
  return s.spread * 1.4 + s.buyerAccess * 1.2 + s.startSpeed * 1.1 + s.simplicity * 0.8;
}

export function rankedNiches(): (Niche & { score: number })[] {
  return NICHES.map((n) => ({ ...n, score: Math.round(attackScore(n.scores) * 10) / 10 }))
    .sort((a, b) => b.score - a.score);
}

export const SPREAD_TIER_LABEL: Record<Niche["spreadTier"], string> = {
  low: "💲 Low", medium: "💲💲 Medium", "medium-high": "💲💲 Med-High", high: "💲💲💲 High", "very-high": "💲💲💲💲 Very high",
};

export function archetype(id: string): BuyerArchetype | undefined {
  return BUYER_ARCHETYPES.find((a) => a.id === id);
}

// ── Auto-suggest (idea #1: tag buyers by niche without anyone typing) ─────────────────────────
// Keyword signals per niche. We scan a buyer's existing buy-box text (type, build/deal/property
// type, buy-box, notes, company) and suggest the niche(s) they already fit. Manual tags override.
// Signals are intentionally distinctive (no bare "lot"/"land") to avoid everything matching infill.
export const NICHE_SIGNALS: Record<string, string[]> = {
  infill_residential: ["infill", "spec home", "spec builder", "single family", "sfr lot", "scattered lot"],
  teardown_redev: ["teardown", "tear down", "redevelop", "townhome", "townhouse", "duplex", "triplex"],
  subdividable_acreage: ["acreage", "subdivide", "subdivision", "assemblage", "land bank", "builder-developer", "master-planned", "master planned"],
  waterfront: ["waterfront", "canal", "lakefront", "lake front", "gulf", "intracoastal", "riverfront", "river front", "dock", "seawall", "water front", "oceanfront", "bayfront"],
  rv_boat_storage: ["storage", "self-storage", "self storage", "rv ", "boat storage", "rv/boat", "outdoor storage", "parking lot operator"],
  commercial_pad: ["commercial", "retail pad", "pad site", "flex", "warehouse", "industrial", "net lease", "c-store", "qsr"],
  mh_rv_park: ["mobile home", "manufactured", "mh park", "mh-zoned", "rv park", "mobile / manufactured", "park operator"],
  solar: ["solar", "utility-scale", "utility scale", "ipp", "renewable", "photovoltaic", "power producer"],
  data_center: ["data center", "data-center", "datacenter", "hyperscale", "hyperscaler"],
  ag_timber: ["agricultural", "timber", "ranch", "farmland", "ag land", "cattle", "grove"],
  mitigation: ["mitigation", "wetland", "conservation", "mitigation bank", "credit bank", "habitat"],
  entitlement: ["entitle", "entitlement", "rezon", "zoning change", "land use change", "comp plan"],
};

// Suggest niche ids from a blob of a buyer's text (lowercased internally). Pure — client-safe.
export function suggestNichesFromText(haystack: string): string[] {
  const h = ` ${(haystack || "").toLowerCase()} `;
  const hits: string[] = [];
  for (const [id, signals] of Object.entries(NICHE_SIGNALS)) {
    if (signals.some((sig) => h.includes(sig))) hits.push(id);
  }
  return hits;
}

export function nicheLabel(id: string): string {
  return NICHES.find((n) => n.id === id)?.label ?? id;
}
// Plain labels (no emoji) for the vetting-form multi-select + label→id for saving.
export const NICHE_LABELS = NICHES.map((n) => n.label);
export function nicheIdForLabel(label: string): string | undefined {
  return NICHES.find((n) => n.label === label.trim())?.id;
}
export function nicheEmoji(id: string): string {
  return NICHES.find((n) => n.id === id)?.emoji ?? "🎯";
}
