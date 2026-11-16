import "server-only";
// 📍 Per-ZIP (and per-city) Buyer↔Seller LAND market index (Jon 2026-11-16, Phase 2b). Computed from
// FREE DealMachine counts for the ZIPs we've actually PULLED — so a rep knows, down to the ZIP, where
// motivated sellers are (buyer's market) vs where sellers have leverage (seller's market). Validated
// live: zip_code locations + market_status(active) + is_mls_pending + last_sale_date all return.
//   • active  = vacant-land listings on market now (market_status = Active)   → SUPPLY
//   • pending = land under contract now (is_mls_pending)                       → pipeline DEMAND
//   • sold90  = land ≥$50k sold in the last 90 days                            → realized DEMAND
// Index 0 = strong BUYER market (lots of supply, slow absorption → motivated sellers → great to pull),
// 100 = strong SELLER market (tight supply, fast absorption → sellers have leverage).
import { db } from "@/lib/db";
import { dmCount, dmConfigured, dmLocationSearch, type DmLoc, type DmFilter } from "@/lib/dealmachine";
import { readPullLists } from "@/lib/pull-lists";
import { tiltForIndex, labelForIndex, repHintForIndex, type MarketTilt } from "@/lib/market-index";

export const ZIP_MARKET_CAT = "__zip_market__";
const LAND_TYPES = [6, 19, 20]; // Vacant Land, Agriculture, Development Site
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const daysAgoISO = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

export type ZipMarket = { zip: string; city: string; state: string; active: number; pending: number; sold90: number; monthsSupply: number | null; index: number; tilt: MarketTilt; label: string; lat?: number; lng?: number };
export type CityMarket = { city: string; state: string; zips: number; active: number; pending: number; sold90: number; monthsSupply: number | null; index: number; tilt: MarketTilt; label: string };
export type ZipMarketStore = { asOf: string; configured: boolean; zips: ZipMarket[]; cities: CityMarket[] };

/** Core buyer↔seller index from the three land counts. null when there's no signal at all. */
export function zipLandIndex(active: number, pending: number, sold90: number): { index: number; monthsSupply: number | null } | null {
  if (!active && !pending && !sold90) return null;
  const monthly = sold90 / 3;
  const mos = monthly > 0 ? active / monthly : active > 0 ? 18 : 0; // months of supply (≈ how long inventory lasts)
  // Months of supply is the primary read: <4 = seller's market, 4–6 balanced, >6 buyer's market.
  const mosIdx = clampN(Math.round(80 - (mos - 2) * 8), 6, 94); // 2mo→80 (seller) … 12mo→~0 (buyer)
  const denom = active + pending;
  const pr = denom > 0 ? pending / denom : 0; // share of listings already under contract → demand heat
  const prIdx = clampN(Math.round(30 + pr * 120), 5, 95); // 0→30, 0.3→66, 0.5→90
  const index = Math.round(mosIdx * 0.7 + prIdx * 0.3);
  return { index, monthsSupply: monthly > 0 ? Math.round(mos * 10) / 10 : null };
}

async function countsForZip(zip: string): Promise<{ active: number; pending: number; sold90: number } | null> {
  const loc: DmLoc[] = [{ type: "zip_code", code: zip }];
  const pt: DmFilter = { filter_id: "property_type", operator: "contains_any", value: LAND_TYPES };
  const active: DmFilter = { filter_id: "market_status", operator: "contains_any", value: [1] };
  const pending: DmFilter = { filter_id: "is_mls_pending", operator: "is_boolean", value: true };
  const land50: DmFilter = { filter_id: "last_sale_price", operator: "greater_than_or_equal", value: 50000 };
  const sold: DmFilter = { filter_id: "last_sale_date", operator: "is_after", value: daysAgoISO(90) };
  const [a, p, s] = await Promise.all([
    dmCount(loc, [pt, active]),
    dmCount(loc, [pt, pending]),
    dmCount(loc, [pt, land50, sold]),
  ]);
  if (!a.ok && !p.ok && !s.ok) return null;
  return { active: a.ok ? a.count!.total_properties : 0, pending: p.ok ? p.count!.total_properties : 0, sold90: s.ok ? s.count!.total_properties : 0 };
}

/** Refresh the ZIP/city index for every PULLED ZIP (capped). ~4 free calls per ZIP. */
export async function refreshZipMarket(opts: { cap?: number } = {}): Promise<ZipMarketStore> {
  if (!dmConfigured()) { const empty: ZipMarketStore = { asOf: new Date().toISOString(), configured: false, zips: [], cities: [] }; await writeZipMarket(empty); return empty; }
  const batches = await readPullLists();
  // centroid per ZIP = the average sample point of a batch that contains it (approx, for the map).
  const centroid = new Map<string, { lat: number; lng: number }>();
  for (const b of batches) {
    if (!b.pts?.length) continue;
    const lat = b.pts.reduce((s, p) => s + p[0], 0) / b.pts.length;
    const lng = b.pts.reduce((s, p) => s + p[1], 0) / b.pts.length;
    for (const z of b.zips) if (!centroid.has(z)) centroid.set(z, { lat, lng });
  }
  const zips = [...new Set(batches.flatMap((b) => b.zips))].filter((z) => /^\d{5}$/.test(z)).slice(0, Math.max(1, opts.cap ?? 60));
  const out: ZipMarket[] = [];
  for (const zip of zips) {
    const c = await countsForZip(zip).catch(() => null);
    if (!c) continue;
    const idx = zipLandIndex(c.active, c.pending, c.sold90);
    if (!idx) continue;
    // city/state label (1 free location lookup). Best-effort — fall back to the bare ZIP.
    let city = "", state = "FL";
    try { const locs = await dmLocationSearch(zip, "zip_code"); const m = locs[0]; if (m) { city = (m.name || "").replace(/,.*$/, "").replace(/\b\d{5}\b/, "").trim(); state = m.state || state; } } catch { /* best-effort */ }
    const cen = centroid.get(zip);
    out.push({ zip, city, state, active: c.active, pending: c.pending, sold90: c.sold90, monthsSupply: idx.monthsSupply, index: idx.index, tilt: tiltForIndex(idx.index), label: labelForIndex(idx.index), ...(cen ? { lat: cen.lat, lng: cen.lng } : {}) });
  }
  // city rollup — aggregate the RAW counts per city, then index the aggregate (more honest than averaging indexes).
  const byCity = new Map<string, { city: string; state: string; zips: number; active: number; pending: number; sold90: number }>();
  for (const z of out) {
    if (!z.city) continue;
    const key = `${z.city}|${z.state}`;
    const cur = byCity.get(key) ?? { city: z.city, state: z.state, zips: 0, active: 0, pending: 0, sold90: 0 };
    cur.zips++; cur.active += z.active; cur.pending += z.pending; cur.sold90 += z.sold90;
    byCity.set(key, cur);
  }
  const cities: CityMarket[] = [...byCity.values()].map((c) => {
    const idx = zipLandIndex(c.active, c.pending, c.sold90) ?? { index: 50, monthsSupply: null };
    return { ...c, monthsSupply: idx.monthsSupply, index: idx.index, tilt: tiltForIndex(idx.index), label: labelForIndex(idx.index) };
  }).sort((a, b) => a.index - b.index);
  out.sort((a, b) => a.index - b.index);
  const store: ZipMarketStore = { asOf: new Date().toISOString(), configured: true, zips: out, cities };
  await writeZipMarket(store);
  return store;
}

export async function readZipMarket(): Promise<ZipMarketStore | null> {
  const row = await db.resource.findFirst({ where: { category: ZIP_MARKET_CAT } }).catch(() => null);
  if (!row?.description) return null;
  try { return JSON.parse(row.description) as ZipMarketStore; } catch { return null; }
}
async function writeZipMarket(s: ZipMarketStore): Promise<void> {
  const description = JSON.stringify(s);
  const row = await db.resource.findFirst({ where: { category: ZIP_MARKET_CAT } }).catch(() => null);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "zip-market", category: ZIP_MARKET_CAT, url: "", description } });
}

/** Re-export for UI framing. */
export { repHintForIndex };
