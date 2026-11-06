// 🗺 Land-comps AREA cache (Jon 2026-11-05: "try to avoid using RentCast — and if we do
// use it, save the land comps for the area so underwriting is faster next time").
// Land values move slowly and comps are shared across a whole ZIP, so the FIRST land pull
// in an area is cached and every later underwrite in that same ZIP reuses it for FREE —
// no RentCast call, no cap burn. Stored in Resource __land_comps__ as a { zip: entry } map,
// same no-migration pattern as __rentcast_usage__ / __dash_layout__.
import { db } from "@/lib/db";
import type { RcEstimate } from "@/lib/rentcast";

const CAT = "__land_comps__";
const MAX_ZIPS = 300;              // ring-cap the map so one Resource row can't grow unbounded
export const LAND_COMPS_FRESH_DAYS = 90; // land comps stay useful ~a quarter

export type LandCompsEntry = RcEstimate & { at: string; sampleAddress: string; zip: string };
type CacheMap = Record<string, LandCompsEntry>;

/** Pull the 5-digit ZIP out of a free-form US address (prefers the LAST 5-digit run,
 *  which is where the ZIP sits). Returns "" when there's nothing cache-keyable. */
export function areaKey(address: string): string {
  const matches = (address || "").match(/\b(\d{5})(?:-\d{4})?\b/g);
  if (!matches || !matches.length) return "";
  return matches[matches.length - 1].slice(0, 5);
}

function daysSince(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 86_400_000;
}

/** Fresh cached land comps for the address's ZIP, or null. Read-only (no API, no cap). */
export async function getCachedLandComps(
  address: string,
  maxAgeDays = LAND_COMPS_FRESH_DAYS,
): Promise<(LandCompsEntry & { ageDays: number }) | null> {
  const zip = areaKey(address);
  if (!zip) return null;
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  if (!row) return null;
  let map: CacheMap = {};
  try { map = JSON.parse(row.description || "{}"); } catch { return null; }
  const hit = map[zip];
  if (!hit) return null;
  const ageDays = daysSince(hit.at);
  if (ageDays > maxAgeDays) return null;
  return { ...hit, ageDays };
}

/** Save a fresh land pull under its ZIP (newest wins; map ring-capped by age). */
export async function saveLandComps(address: string, est: RcEstimate): Promise<void> {
  const zip = areaKey(address);
  if (!zip) return; // nothing to key on — skip silently
  const row = await db.resource.findFirst({ where: { category: CAT } });
  let map: CacheMap = {};
  try { map = JSON.parse(row?.description || "{}"); } catch { /* fresh */ }
  map[zip] = { ...est, at: new Date().toISOString(), sampleAddress: address.slice(0, 120), zip };
  // Ring-cap: if we're over the limit, drop the oldest entries.
  const keys = Object.keys(map);
  if (keys.length > MAX_ZIPS) {
    keys.sort((a, b) => Date.parse(map[a].at) - Date.parse(map[b].at)); // oldest first
    for (const k of keys.slice(0, keys.length - MAX_ZIPS)) delete map[k];
  }
  const description = JSON.stringify(map);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "land-comps-cache", category: CAT, url: "", description } });
}
