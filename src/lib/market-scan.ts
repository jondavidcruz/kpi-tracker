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
import { landSoldFor } from "@/lib/land-sold";

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
// 📈 Market VELOCITY from DealMachine (Jon 2026-11-11: "how many lands sold in 30/90/180, same for
// new construction, how fast pending"). All FREE counts, validated filter shapes:
//   land sold = property_type[6,19,20] + last_sale_date is_after <date>
//   new-con sold = property_type[1,2,3] + year_built ≥ (yr-3) + last_sale_date is_after <date>
//   pending = property_type + is_mls_pending=true
//   YoY land = land sold last 365d vs. the 365d before (both via is_after; no date_range needed).
export type LandTrends = {
  landSold: { d30: number; d90: number; d180: number };
  newConSold: { d30: number; d90: number; d180: number };
  landPending: number; newConPending: number;
  yoyLandPct: number | null; // land-sales growth: +% = more land selling than a year ago
  asOf: string;
};
export type CountyScan = {
  fips: string; name: string; state: string; metro: string;
  medianSalePrice: number | null; yoyPct: number | null; priceAsOf: string | null;
  daysToPending: number | null; inventory: number | null;
  land: LandProfile | null;
  trends?: LandTrends | null; // added 2026-11-11; optional so pre-existing cached scans/seed still fit
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
      land: null, trends: null, score: 0, tier: "low", reasons: [],
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

// ── 📈 Land + new-construction VELOCITY (free DealMachine counts) ──
const LAND_SOLD_TYPES = [6, 19, 20];      // Vacant Land, Agriculture, Development Site
const NEWCON_TYPES = [1, 2, 3];           // Single Family, Townhouse, Condominium
function daysAgoISO(days: number): string { return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10); }

/** 10 free counts: how much LAND and NEW CONSTRUCTION sold in the last 30/90/180 days, how many are
 *  pending now, and the land-sales YoY. Null if the v2 key isn't live. FL/SC both fine (counts, not
 *  assessed-value thresholds). */
export async function landTrendsFor(fips: string): Promise<LandTrends | null> {
  if (!dmConfigured()) return null;
  const loc: DmLoc[] = [{ type: "county", code: fips }];
  const newconYear = new Date().getFullYear() - 3;
  const pt = (ids: number[]): DmFilter => ({ filter_id: "property_type", operator: "contains_any", value: ids });
  const soldAfter = (d: string): DmFilter => ({ filter_id: "last_sale_date", operator: "is_after", value: d });
  const built: DmFilter = { filter_id: "year_built", operator: "greater_than_or_equal", value: newconYear };
  const pending: DmFilter = { filter_id: "is_mls_pending", operator: "is_boolean", value: true };
  const n = (r: { ok: boolean; count?: { total_properties: number } }) => (r.ok ? r.count!.total_properties || 0 : 0);
  const [l30, l90, l180, l365, l730, c30, c90, c180, lp, np] = await Promise.all([
    dmCount(loc, [pt(LAND_SOLD_TYPES), soldAfter(daysAgoISO(30))]),
    dmCount(loc, [pt(LAND_SOLD_TYPES), soldAfter(daysAgoISO(90))]),
    dmCount(loc, [pt(LAND_SOLD_TYPES), soldAfter(daysAgoISO(180))]),
    dmCount(loc, [pt(LAND_SOLD_TYPES), soldAfter(daysAgoISO(365))]),
    dmCount(loc, [pt(LAND_SOLD_TYPES), soldAfter(daysAgoISO(730))]),
    dmCount(loc, [pt(NEWCON_TYPES), built, soldAfter(daysAgoISO(30))]),
    dmCount(loc, [pt(NEWCON_TYPES), built, soldAfter(daysAgoISO(90))]),
    dmCount(loc, [pt(NEWCON_TYPES), built, soldAfter(daysAgoISO(180))]),
    dmCount(loc, [pt(LAND_SOLD_TYPES), pending]),
    dmCount(loc, [pt(NEWCON_TYPES), built, pending]),
  ]);
  if (!l90.ok && !l30.ok && !l180.ok) return null; // v2 key down / all failed
  const last365 = n(l365), prior365 = Math.max(0, n(l730) - n(l365));
  const yoy = prior365 > 0 ? Math.round(((last365 - prior365) / prior365) * 100) : null;
  return {
    landSold: { d30: n(l30), d90: n(l90), d180: n(l180) },
    newConSold: { d30: n(c30), d90: n(c90), d180: n(c180) },
    landPending: n(lp), newConPending: n(np),
    yoyLandPct: yoy, asOf: new Date().toISOString(),
  };
}

// 🍩 Bid-rent "Conversion Ring" signal (Jon 2026-11-11, from bid-rent theory): the doughnut ring
// where cheap LAND is actively being converted to HOUSING — where builders are marching outward.
// HIGH when new construction is selling (demand frontier) AND vacant land is still liquid/available
// (supply to flip). LOW at the maxed core (no land left) or the dead edge (no building yet). The
// geometric mean rewards having BOTH; a market strong on only one dimension scores low on purpose.
// `residual` = a rough "what a builder could pay for a lot" ≈ 15% of the finished-home price (a land
// rule of thumb) — directional for targeting/offers, NOT an appraisal (underwrite properly per deal).
export function bidRentSignals(c: CountyScan): { ring: number; residual: number | null } {
  const t = c.trends;
  const newcon90 = t?.newConSold.d90 ?? 0;
  const land90 = t?.landSold.d90 ?? 0;
  const yoy = t?.yoyLandPct ?? 0;
  const demand = Math.min(1, newcon90 / 50);   // ~50 new-con sales/90d = strong expanding frontier
  const supply = Math.min(1, land90 / 150);    // land actively transacting = liquid supply to flip
  const growth = 1 + Math.max(-0.3, Math.min(0.5, yoy / 100));
  const ring = t && (newcon90 || land90) ? Math.round(Math.min(100, 100 * Math.sqrt(demand * supply) * growth)) : 0;
  const home = c.medianSalePrice;
  const residual = home ? Math.round((home * 0.15) / 1000) * 1000 : null; // ≈15% of finished home = rough raw-land budget
  return { ring, residual };
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
    // 🧾 Land SOLD signal — markets where land ACTUALLY sells ≥$100k rank up (truer than assessed).
    const ls = landSoldFor(c.fips);
    if (ls) { score = Math.min(100, score + Math.round(ls.share * 12)); r.push(`🧾 ${Math.round(ls.share * 100)}% of recent land sales ≥$100k (${ls.high.toLocaleString()} of ${ls.total.toLocaleString()})`); }
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

export const LAND_TTL_MS = 14 * 86_400_000;   // land value buckets: slow-moving assessor data → 2 weeks
export const TRENDS_TTL_MS = 7 * 86_400_000;   // velocity moves faster → refresh land/new-con trends weekly

/** 🔁 Self-paced market-scan refresh (free data) — rebuild Zillow, carry forward + enrich the
 *  stalest land buckets + velocity trends (time-boxed), re-score, store. Used by the daily cron so
 *  the map's land-trends fill in on their own (Jon 2026-11-11), and reusable by the manager button. */
export async function refreshMarketScan(opts?: { states?: string[]; budgetMs?: number }): Promise<{ ok: boolean; landDone: number; trendsDone: number; error?: string }> {
  const started = Date.now();
  const budget = opts?.budgetMs ?? 48_000;
  const states = opts?.states ?? ["FL", "SC"];
  let zillow;
  try { zillow = await buildZillowCounties(states); } catch (e) { return { ok: false, landDone: 0, trendsDone: 0, error: `zillow: ${String(e).slice(0, 100)}` }; }
  const counties = zillow.counties;
  const prior = await readScan();
  const priorLand = new Map<string, CountyScan["land"]>((prior?.counties ?? []).map((c) => [c.fips, c.land]));
  const priorTrends = new Map<string, CountyScan["trends"]>((prior?.counties ?? []).map((c) => [c.fips, c.trends]));
  for (const c of counties) { const l = priorLand.get(c.fips); if (l) c.land = l; const t = priorTrends.get(c.fips); if (t) c.trends = t; }
  let landDone = 0, trendsDone = 0;
  if (dmConfigured()) {
    const now = Date.now();
    const needsLand = (c: CountyScan) => c.state === "FL" && (!c.land || now - new Date(c.land.asOf).getTime() > LAND_TTL_MS);
    const needsTrends = (c: CountyScan) => !c.trends || now - new Date(c.trends.asOf).getTime() > TRENDS_TTL_MS;
    const queue = [...counties].filter((c) => needsLand(c) || needsTrends(c)).sort((a, b) => (b.medianSalePrice ?? 0) - (a.medianSalePrice ?? 0));
    for (const c of queue) {
      if (Date.now() - started > budget) break;
      if (c.state === "FL" && needsLand(c)) { const lp = await landProfileFor(c.fips).catch(() => null); if (lp) { c.land = lp; landDone++; } }
      if (Date.now() - started > budget) break;
      if (needsTrends(c)) { const tr = await landTrendsFor(c.fips).catch(() => null); if (tr) { c.trends = tr; trendsDone++; } }
    }
  }
  const scored = scoreCounties(counties);
  await writeScan({ asOf: new Date().toISOString(), zillowAsOf: zillow.zillowAsOf, landConfigured: dmConfigured(), landDone, counties: scored });
  return { ok: true, landDone, trendsDone };
}
