// 🔎 Market Finder — a county-wide OPPORTUNITY SCAN from free public data, to DISCOVER new
// high-margin land markets (Jon 2026-11-07: "find areas where land sells over $100k-200k, not
// Lehigh-Acres sub-$30k"). Distinct from the Target Markets board (that tracks markets we've
// ALREADY chosen + our own pipeline); this scans EVERY county from outside data to find the
// next one.
//
// Sources (all free, no RentCast, respecting [[platform-usage-watch]]):
//   • Zillow Research public county CSVs — median SALE price + 12-mo trend, days-to-pending,
//     for-sale inventory. Pure HTTP, no key, refreshes server-side. Joined by county FIPS.
//   • DealMachine FREE counts (reusing src/lib/dealmachine dmCount) — vacant/ag/dev LAND bucketed
//     by assessed_land_value (the assessor's land value — reliable, unlike the land AVM which
//     wildly over-values). Gives each county's share of land assessing ≥$100k = the land-margin
//     signal. Only runs when the v2 key is live in Vercel; degrades to Zillow-only otherwise.
//
// Cached in the private DB (Resource __market_scan__) — refreshed by the daily cron + a manager
// "refresh" button. No schema change, no PII, no real $ in the public repo (numbers come from
// the live sources at request time).
import { db } from "@/lib/db";
import { dmCount, dmConfigured, type DmLoc, type DmFilter } from "@/lib/dealmachine";
import { wealthFor } from "@/lib/elite-markets";

export const MARKET_SCAN_CAT = "__market_scan__";

const ZILLOW = {
  salePrice: "https://files.zillowstatic.com/research/public_csvs/median_sale_price/County_median_sale_price_uc_sfrcondo_sm_month.csv",
  daysToPending: "https://files.zillowstatic.com/research/public_csvs/med_doz_pending/County_med_doz_pending_uc_sfrcondo_sm_month.csv",
  inventory: "https://files.zillowstatic.com/research/public_csvs/invt_fs/County_invt_fs_uc_sfrcondo_sm_month.csv",
} as const;

// Land = vacant land + agricultural(unimproved) + developed-site, matching dmMarketInventory.
const LAND_TYPES = [6, 19, 20];

export type LandProfile = {
  total: number; cheap: number; sweet: number; high: number; prem: number; // ≤40k / 100-200k / ≥100k / ≥200k
  highShare: number; cheapShare: number; asOf: string;
};
export type CountyScan = {
  fips: string; name: string; state: string; metro: string;
  medianSalePrice: number | null; yoyPct: number | null; priceAsOf: string | null;
  daysToPending: number | null; inventory: number | null;
  land: LandProfile | null;
  score: number; tier: "target" | "watch" | "low"; reasons: string[];
};
export type ScanStore = {
  asOf: string; zillowAsOf: string | null; landConfigured: boolean; landDone: number; counties: CountyScan[];
};

// ── minimal CSV (handles double-quoted fields with embedded commas, e.g. the Metro column) ──
function parseCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur); return out;
}

type ZMetric = { latest: number; asOf: string; yoy: number | null };
async function fetchZillowMetric(url: string, states: Set<string>): Promise<Map<string, ZMetric>> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`zillow ${res.status}`);
  const text = await res.text();
  const lines = text.split("\n");
  const header = parseCsvLine(lines[0]);
  const stateIdx = header.indexOf("State");
  const sfIdx = header.indexOf("StateCodeFIPS");
  const mfIdx = header.indexOf("MunicipalCodeFIPS");
  const firstDate = header.findIndex((h) => /^\d{4}-\d{2}-\d{2}$/.test(h));
  const out = new Map<string, ZMetric>();
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const row = parseCsvLine(lines[i]);
    if (!states.has(row[stateIdx])) continue;
    const fips = (row[sfIdx] || "").padStart(2, "0") + (row[mfIdx] || "").padStart(3, "0");
    if (fips.length !== 5) continue;
    // walk from the right for the last non-empty value + the one 12 months back
    const vals: { v: number; d: string }[] = [];
    for (let c = firstDate; c < row.length; c++) {
      const raw = row[c];
      if (raw === "" || raw === "NaN") continue;
      const n = Number(raw); if (Number.isFinite(n)) vals.push({ v: n, d: header[c] });
    }
    if (!vals.length) continue;
    const last = vals[vals.length - 1];
    const back = vals.length > 12 ? vals[vals.length - 1 - 12] : null;
    const yoy = back && back.v ? ((last.v - back.v) / back.v) * 100 : null;
    out.set(fips, { latest: last.v, asOf: last.d, yoy: yoy == null ? null : Math.round(yoy * 10) / 10 });
  }
  return out;
}

// Pull county NAME/metro/state from the sale-price file (the authoritative county list).
async function fetchZillowCountyMeta(states: Set<string>): Promise<Map<string, { name: string; state: string; metro: string }>> {
  const res = await fetch(ZILLOW.salePrice, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`zillow meta ${res.status}`);
  const lines = (await res.text()).split("\n");
  const h = parseCsvLine(lines[0]);
  const [nameI, stateI, metroI, sfI, mfI] = ["RegionName", "State", "Metro", "StateCodeFIPS", "MunicipalCodeFIPS"].map((k) => h.indexOf(k));
  const out = new Map<string, { name: string; state: string; metro: string }>();
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const row = parseCsvLine(lines[i]);
    if (!states.has(row[stateI])) continue;
    const fips = (row[sfI] || "").padStart(2, "0") + (row[mfI] || "").padStart(3, "0");
    if (fips.length !== 5) continue;
    out.set(fips, { name: row[nameI], state: row[stateI], metro: row[metroI] || "" });
  }
  return out;
}

/** Build the Zillow backbone for the given states (default FL). No key needed. */
export async function buildZillowCounties(states = ["FL"]): Promise<{ counties: CountyScan[]; zillowAsOf: string | null }> {
  const set = new Set(states);
  const [meta, price, dtp, inv] = await Promise.all([
    fetchZillowCountyMeta(set),
    fetchZillowMetric(ZILLOW.salePrice, set),
    fetchZillowMetric(ZILLOW.daysToPending, set).catch(() => new Map<string, ZMetric>()),
    fetchZillowMetric(ZILLOW.inventory, set).catch(() => new Map<string, ZMetric>()),
  ]);
  let zillowAsOf: string | null = null;
  const counties: CountyScan[] = [];
  for (const [fips, m] of meta) {
    const p = price.get(fips);
    if (p && (!zillowAsOf || p.asOf > zillowAsOf)) zillowAsOf = p.asOf;
    counties.push({
      fips, name: m.name, state: m.state, metro: m.metro,
      medianSalePrice: p?.latest ?? null, yoyPct: p?.yoy ?? null, priceAsOf: p?.asOf ?? null,
      daysToPending: dtp.get(fips)?.latest ?? null, inventory: inv.get(fips)?.latest ?? null,
      land: null, score: 0, tier: "low", reasons: [],
    });
  }
  return { counties, zillowAsOf };
}

// ── DealMachine land buckets (FREE counts) — the land-margin signal ──
function landFilter(min?: number, max?: number): DmFilter[] {
  const f: DmFilter[] = [{ filter_id: "property_type", operator: "contains_any", value: LAND_TYPES }];
  if (min != null || max != null) {
    f.push({ filter_id: "assessed_land_value", operator: "range", value: { ...(min != null ? { min } : {}), ...(max != null ? { max } : {}) } });
  }
  return f;
}
// "valued" = land parcels that have a positive assessor land value. Using it as the denominator
// (instead of all land, incl. null/zero assessor records) keeps the ≥$100k share honest in
// counties where DealMachine's assessor coverage is sparse.
function landValuedFilter(): DmFilter[] { return [...landFilter(), { filter_id: "assessed_land_value", operator: "greater_than_or_equal", value: 1 }]; }

const MIN_VALUED = 1500; // below this the assessor sample is too thin to trust → treat as n/a

/** Land value profile for ONE FL county (3 free counts). Null if the v2 key isn't live, the
 *  assessor sample is too thin, or (caller's job) the county isn't FL. Assessed-value thresholds
 *  only make sense in FL — SC assesses at a fractional ratio, so SC land is left n/a upstream. */
export async function landProfileFor(fips: string): Promise<LandProfile | null> {
  if (!dmConfigured()) return null;
  const loc: DmLoc[] = [{ type: "county", code: fips }];
  const [valued, high, sweet] = await Promise.all([
    dmCount(loc, landValuedFilter()),
    dmCount(loc, landFilter(100000)),
    dmCount(loc, landFilter(100000, 200000)),
  ]);
  if (!valued.ok) return null;
  const v = valued.count!.total_properties || 0;
  if (v < MIN_VALUED) return null;
  const hi = high.ok ? high.count!.total_properties : 0;
  const sw = sweet.ok ? sweet.count!.total_properties : 0;
  return {
    total: v, cheap: Math.max(0, v - hi), sweet: sw, high: hi, prem: Math.max(0, hi - sw),
    highShare: v ? hi / v : 0, cheapShare: v ? Math.max(0, v - hi) / v : 0, asOf: new Date().toISOString(),
  };
}

// ── Opportunity scoring ──
function percentileRanks(vals: (number | null)[]): (number | null) [] {
  const present = vals.map((v, i) => ({ v, i })).filter((x) => x.v != null) as { v: number; i: number }[];
  const sorted = [...present].sort((a, b) => a.v - b.v);
  const rank = new Map<number, number>();
  sorted.forEach((x, idx) => rank.set(x.i, sorted.length > 1 ? idx / (sorted.length - 1) : 1));
  return vals.map((_, i) => (rank.has(i) ? rank.get(i)! : null));
}
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Score + rank every county (mutates in place, then returns sorted desc). */
export function scoreCounties(counties: CountyScan[]): CountyScan[] {
  const pPct = percentileRanks(counties.map((c) => c.medianSalePrice));
  counties.forEach((c, i) => {
    const pScore = pPct[i] ?? 0;                                   // price tier (margin headroom)
    const tScore = c.yoyPct == null ? 0.4 : clamp01((c.yoyPct + 5) / 15); // −5%→0, +10%→1
    const lScore = c.daysToPending == null ? 0.5 : clamp01((110 - c.daysToPending) / 90); // faster = more liquid
    const hasLand = c.land != null && c.land.total > 0;
    const landScore = hasLand ? clamp01(c.land!.highShare / 0.22) : 0; // 22%+ land ≥$100k = top
    const composite = hasLand
      ? 0.35 * landScore + 0.30 * pScore + 0.20 * tScore + 0.15 * lScore
      : 0.48 * pScore + 0.32 * tScore + 0.20 * lScore;
    let score = Math.round(100 * composite);

    // Reasons (plain English).
    const r: string[] = [];
    if (c.medianSalePrice != null) r.push(`Homes median $${Math.round(c.medianSalePrice).toLocaleString()}${c.yoyPct != null ? ` · ${c.yoyPct >= 0 ? "+" : ""}${c.yoyPct}% YoY` : ""}`);
    if (c.daysToPending != null) r.push(`Sells in ~${Math.round(c.daysToPending)} days`);
    if (hasLand) {
      r.push(`Land: ${Math.round(c.land!.highShare * 100)}% of parcels assess ≥$100k (${c.land!.high.toLocaleString()} of ${c.land!.total.toLocaleString()})`);
      r.push(`${c.land!.sweet.toLocaleString()} parcels in the $100k–200k band`);
    }
    // Hard cheap-land demotion (the Lehigh-Acres / Port-Charlotte filter): a high-VOLUME glut of
    // low-value platted lots — lots of priced land, little of it ≥$100k.
    if (hasLand && c.land!.total > 30000 && c.land!.highShare < 0.12) {
      score = Math.min(score, 35);
      r.push("⚠️ High-volume cheap-land glut — tons of platted lots, few ≥$100k (Lehigh-Acres / Port-Charlotte style)");
    }
    // 🏆 Elite-market lift (Viktoriia's wealth research) — affluent / waterfront markets rank up
    // even when land data is thin (e.g. Palm Beach shows land "—"). wealth 5.0 → +16, 4.5 → +12.
    const wt = wealthFor(c.fips);
    if (wt) {
      score = Math.min(100, score + Math.max(0, Math.round((wt.wealth - 3) * 8)));
      r.push(`🏆 ${wt.label} — elite market (wealth ${wt.wealth.toFixed(1)}/5${wt.enclaves.length ? `, enclaves: ${wt.enclaves.slice(0, 3).join(", ")}` : ""})`);
    }
    c.score = score;
    c.tier = score >= 72 ? "target" : score >= 50 ? "watch" : "low";
    c.reasons = r;
  });
  return [...counties].sort((a, b) => b.score - a.score);
}

// ── store ──
export async function readScan(): Promise<ScanStore | null> {
  const row = await db.resource.findFirst({ where: { category: MARKET_SCAN_CAT } }).catch(() => null);
  if (!row?.description) return null;
  try { return JSON.parse(row.description) as ScanStore; } catch { return null; }
}
export async function writeScan(store: ScanStore): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: MARKET_SCAN_CAT } }).catch(() => null);
  const description = JSON.stringify(store);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } }).catch(() => {});
  else await db.resource.create({ data: { title: "market-scan", category: MARKET_SCAN_CAT, url: "", description } }).catch(() => {});
}
