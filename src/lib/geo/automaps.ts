// Auto buy-box maps: build + cache one coverage image URL per vetted buyer
// (Resource __buybox_automaps__, keyed by buyer id, sig-guarded so a map only
// rebuilds when the buyer's geo actually changes). Geo is merged the same way
// the scorecard does it: structured buy box + land-interview fields.
import { db } from "@/lib/db";
import { buildAutoMap, geoSig, type AutoMap } from "@/lib/geo/buyboxMap";
import { normCounty } from "@/lib/buyers/scorecard";
import { regionCounties } from "@/lib/buybox/regions";
import type { BuyBox } from "@/lib/buybox/types";

export const AUTOMAPS_CAT = "__buybox_automaps__";

export type AutoMapRow = AutoMap & { at: string };
export type AutoMapStore = Record<string, AutoMapRow>;

const splitList = (s?: string) => (s ?? "").split(/[\n;,]+/).map((x) => x.trim()).filter(Boolean);

export async function readAutoMaps(): Promise<AutoMapStore> {
  const row = await db.resource.findFirst({ where: { category: AUTOMAPS_CAT } }).catch(() => null);
  try { return JSON.parse(row?.description || "{}"); } catch { return {}; }
}
async function writeAutoMaps(s: AutoMapStore) {
  const row = await db.resource.findFirst({ where: { category: AUTOMAPS_CAT } });
  const description = JSON.stringify(s);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "buybox-automaps", category: AUTOMAPS_CAT, url: "", description } });
}

/** The merged, drawable geo for one buyer (buy box ∪ land interview). */
export function mergedGeo(buyBoxStruct: unknown, land?: { buyCounties?: string; buyCities?: string }): Partial<BuyBox["geo"]> {
  const bb = (buyBoxStruct as BuyBox | null)?.geo;
  const counties = new Set<string>();
  const cities = new Set<string>();
  bb?.counties?.forEach((c) => counties.add(normCounty(c)));
  bb?.regions?.forEach((r) => regionCounties(r).forEach((c) => counties.add(normCounty(c))));
  splitList(land?.buyCounties).forEach((c) => counties.add(normCounty(c)));
  bb?.cities?.forEach((c) => cities.add(c.trim()));
  splitList(land?.buyCities).forEach((c) => cities.add(c));
  return { counties: [...counties], cities: [...cities], zips: bb?.zips ?? [], regions: [], radius: bb?.radius ?? null, nationwide: !!bb?.nationwide, exclusions: [], states: bb?.states ?? [] } as Partial<BuyBox["geo"]>;
}

/** Rebuild stale/missing maps, a few buyers per run (each map = several cached
 *  TIGERweb + geocode calls on first build). Returns what changed. */
export async function refreshAutoMaps(opts?: { onlyBuyerId?: string; limit?: number; deadlineMs?: number }): Promise<{ built: number; skipped: number; pending: number }> {
  if (!process.env.GOOGLE_MAPS_API_KEY) return { built: 0, skipped: 0, pending: -1 };
  const deadline = opts?.deadlineMs ?? Date.now() + 40000;
  const limit = opts?.limit ?? 6;
  const landRow = await db.resource.findFirst({ where: { category: "__buyer_land__" } }).catch(() => null);
  let land: Record<string, { buyCounties?: string; buyCities?: string }> = {};
  try { land = JSON.parse(landRow?.description || "{}"); } catch { /* none */ }

  const buyers = await db.marketContact.findMany({
    where: { archivedAt: null, vetStage: { in: ["vetted", "active"] }, ...(opts?.onlyBuyerId ? { id: opts.onlyBuyerId } : {}) },
    select: { id: true, buyBoxStruct: true },
  });
  const store = await readAutoMaps();
  let built = 0, skipped = 0, pending = 0;
  for (const b of buyers) {
    const geo = mergedGeo(b.buyBoxStruct, land[b.id]);
    const sig = geoSig(geo);
    const have = store[b.id];
    if (have && have.sig === sig) { skipped++; continue; }
    if (built >= limit || Date.now() > deadline) { pending++; continue; }
    const map = await buildAutoMap(geo).catch(() => null);
    if (map) { store[b.id] = { ...map, at: new Date().toISOString() }; built++; }
    else { delete store[b.id]; skipped++; } // nothing drawable (empty/nationwide box)
  }
  if (built) await writeAutoMaps(store);
  return { built, skipped, pending };
}
