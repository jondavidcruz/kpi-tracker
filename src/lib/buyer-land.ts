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

// ── Seeding the interview from the older ⊕ buy-box CRM fields ────────────────
// Developers vetted before the standard interview already answered some of the
// questions in the spreadsheet's ⊕ panel — pre-fill the interview from those so
// nobody re-types what we know (first "Save interview" locks them in).

/** "$400k–$700k" / "$50,000 - 500k" → {min, max} in dollars. */
export function parseMoneyRange(s: string | undefined): { min?: number; max?: number } {
  const nums = [...(s ?? "").matchAll(/\$?\s*(\d[\d,.]*)\s*([kKmM])?/g)]
    .map((x) => {
      let n = Number(x[1].replace(/,/g, ""));
      const suf = (x[2] ?? "").toLowerCase();
      if (suf === "k") n *= 1e3;
      if (suf === "m") n *= 1e6;
      return n;
    })
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return {};
  return { min: Math.min(...nums), max: nums.length > 1 ? Math.max(...nums) : undefined };
}

/** "7,000 sf" → 0.16 acres; "2 ac" / "2" → 2. Square feet detected by unit or size. */
export function parseAcres(s: string | undefined): number | undefined {
  const m = (s ?? "").match(/(\d[\d,.]*)/);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (/s\.?\s?f|sq/i.test(s ?? "") || n > 2000) return Math.round((n / 43560) * 100) / 100;
  return n;
}

const SPEED_MAP: Record<string, string> = {
  "Cash, < 14 days": "Cash — under 14 days", "15–30 days": "15–30 days",
  "30–45 days": "30–60 days", "Financed": "Needs financing / longer",
};
const DEAL_TYPE_MAP: Record<string, string> = {
  "Land / lots": "Infill lots", "Teardown": "Teardowns", "Entitled lots": "Entitled / paper lots",
  "Build-to-rent": "Build-to-rent tracts",
};
const SIZE_MAP: Record<string, string> = {
  "Mom & Pop (1–2 / yr)": "Mom-and-pop", "Small / local builder": "Regional/Spec",
  "Regional builder": "Regional/Spec", "National (e.g. DR Horton, Lennar)": "National",
  "Private investor / fund": "Fund/Investor", "REIT / institutional": "Fund/Investor",
};

export type CrmSeed = {
  market?: string; buyBoxAreas?: string; closingSpeed?: string; dealType?: string;
  priceRange?: string; minLotSize?: string; companySize?: string;
};

/** Interview defaults derived from the older CRM fields (never overrides saved answers). */
export function seedFromCrm(crm: CrmSeed): Partial<BuyerLand> {
  const price = parseMoneyRange(crm.priceRange);
  const hay = `${crm.market ?? ""} ${crm.buyBoxAreas ?? ""}`;
  const states = [...new Set([...hay.matchAll(/\b(CA|TX|FL|TN)\b/g)].map((m) => m[1]))].join(", ");
  const landTypes = (crm.dealType ?? "").split(",").map((s) => DEAL_TYPE_MAP[s.trim()]).filter(Boolean).join(", ");
  const cities = (crm.buyBoxAreas ?? "").split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).join("\n");
  const out: Partial<BuyerLand> = {
    buyStates: states || undefined,
    buyCities: cities || undefined,
    landTypes: landTypes || undefined,
    closeSpeed: SPEED_MAP[(crm.closingSpeed ?? "").trim()],
    priceMin: price.min, priceMax: price.max,
    lotMin: parseAcres(crm.minLotSize),
    builderType: SIZE_MAP[(crm.companySize ?? "").trim()],
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && v !== "")) as Partial<BuyerLand>;
}

/** Saved answers win; CRM seed fills the gaps (what the form actually shows). */
export function effectiveLand(l: BuyerLand | undefined, crm: CrmSeed): BuyerLand {
  const saved = Object.fromEntries(Object.entries(l ?? {}).filter(([, v]) => v !== undefined && v !== "")) as BuyerLand;
  return { ...seedFromCrm(crm), ...saved };
}

/** True if any of the buyer's target zips appears in the deal address string. */
export function zipMatch(land: BuyerLand | undefined, address: string): boolean {
  if (!land?.targetZips) return false;
  const zips = land.targetZips.split(/[,\s]+/).map((z) => z.trim()).filter((z) => /^\d{5}$/.test(z));
  return zips.some((z) => address.includes(z));
}
