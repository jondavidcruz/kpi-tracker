// Land buy-box fields for vetted buyers (kept out of "use server" actions).
// Stored per-buyer as JSON in Resource __buyer_land__ (no migration). The
// "isLandBuyer" tag + target zips feed the buyer cascade ranking for lot deals.
//
// 2026-09-21 (Jon): expanded into the STANDARD DEVELOPER INTERVIEW — the same
// questions asked of every developer, so we can reverse-engineer WHERE they buy
// and pull seller leads there. Old fields kept for back-compat.

export type BuyerLand = {
  isLandBuyer?: boolean;
  // ── WHERE they buy (the reverse-engineering fuel) ──
  buyStates?: string;     // e.g. "TN, TX"
  buyCounties?: string;   // one per line — "Davidson, TN"
  buyCities?: string;     // one per line — "Nashville", "Katy"
  targetZips?: string;    // comma-separated
  // ── WHAT they buy ──
  landTypes?: string;     // comma list from LAND_TYPES
  lotMin?: number;        // acres
  lotMax?: number;        // acres
  acresTypical?: string;  // total/typical acreage sought ("40–100 ac for phase 1")
  utilities?: string;     // one of UTILITY_OPTS
  zoningPref?: string;    // one of ZONING_OPTS
  // ── MONEY & SPEED ──
  priceMin?: number;      // purchase price per deal ($)
  priceMax?: number;
  pricePerLot?: number;   // what they pay per standard finished/paper lot
  closeSpeed?: string;    // one of CLOSE_OPTS
  // ── VOLUME & PROFILE ──
  lotsPerYear?: number;   // how many lots/deals they take down a year
  permits12mo?: number;   // permits pulled last 12 months (activity signal)
  builderType?: string;   // National | Spec | Mom-and-pop | Fund
  dealBreakers?: string;  // wetlands, main road, no utilities…
  notes?: string;
  // legacy (pre-interview) — superseded by `utilities`; still honored on read
  utilitiesRequired?: boolean;
};

export const BUILDER_TYPES = ["", "National", "Regional/Spec", "Mom-and-pop", "Fund/Investor"];
export const LAND_TYPES = [
  "Infill lots", "Teardowns", "Entitled / paper lots", "Subdivision acreage",
  "Rural / recreational", "Commercial pads", "Build-to-rent tracts", "Agricultural",
];
export const UTILITY_OPTS = ["Must have utilities at street", "Prefers utilities, will extend", "Raw land OK (septic/well)"];
export const ZONING_OPTS = ["Entitled / permit-ready only", "Correct zoning, raw OK", "Will entitle themselves (any)"];
export const CLOSE_OPTS = ["Cash — under 14 days", "15–30 days", "30–60 days", "Needs financing / longer"];

/** The 10 standard interview answers — drives the per-developer completeness meter. */
export function interviewScore(l: BuyerLand | undefined): { done: number; total: number } {
  const x = l ?? {};
  const answers = [
    x.buyCounties || x.buyCities || x.buyStates || x.targetZips, // 1 where
    x.landTypes,                                                  // 2 land types
    x.lotMin || x.lotMax,                                         // 3 lot size
    x.acresTypical,                                               // 4 acreage sought
    x.priceMin || x.priceMax || x.pricePerLot,                    // 5 price
    x.closeSpeed,                                                 // 6 close speed
    x.utilities || x.utilitiesRequired,                           // 7 utilities
    x.zoningPref,                                                 // 8 zoning
    x.lotsPerYear || x.permits12mo,                               // 9 volume
    x.dealBreakers,                                               // 10 deal breakers
  ];
  return { done: answers.filter(Boolean).length, total: answers.length };
}

/** Aggregate WHERE all developers buy → ranked demand list for lead pulling. */
export function demandAreas(
  land: Record<string, BuyerLand>,
  nameOf: (buyerId: string) => string,
): { area: string; devs: string[] }[] {
  const map = new Map<string, { area: string; devs: Set<string> }>();
  const add = (raw: string, dev: string) => {
    const area = raw.trim().replace(/\s+/g, " ");
    if (!area) return;
    const key = area.toLowerCase();
    const e = map.get(key) ?? { area, devs: new Set<string>() };
    e.devs.add(dev);
    map.set(key, e);
  };
  for (const [id, l] of Object.entries(land)) {
    const dev = nameOf(id);
    if (!dev) continue;
    // Counties split on lines/semicolons only, so "Davidson, TN" stays one entry.
    for (const part of (l.buyCounties ?? "").split(/[\n;]+/)) add(part, dev);
    for (const part of (l.buyCities ?? "").split(/[\n,;]+/)) add(part, dev);
    for (const z of (l.targetZips ?? "").split(/[\s,;]+/)) if (/^\d{5}$/.test(z.trim())) add(z.trim(), dev);
  }
  return [...map.values()]
    .map((e) => ({ area: e.area, devs: [...e.devs].sort() }))
    .sort((a, z) => z.devs.length - a.devs.length || a.area.localeCompare(z.area));
}

/** True if any of the buyer's target zips appears in the deal address string. */
export function zipMatch(land: BuyerLand | undefined, address: string): boolean {
  if (!land?.targetZips) return false;
  const zips = land.targetZips.split(/[,\s]+/).map((z) => z.trim()).filter((z) => /^\d{5}$/.test(z));
  return zips.some((z) => address.includes(z));
}
