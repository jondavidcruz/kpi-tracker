// 📍 Free geocoding via OpenStreetMap Nominatim, aggressively CACHED (Jon 2026-11-05: free
// methods only, nothing that strains Supabase/Vercel). Every place string is geocoded at most
// ONCE and the result (or a null "not found") is stored in reserved Resource JSON, so the map
// reads the cache with zero external calls. New places are geocoded only by an explicit,
// rate-limited batch action — never on page render. Nominatim policy: ≤1 req/sec + a real
// User-Agent; we sleep 1.1s between calls and cap the batch to stay well under Vercel's limit.
import { db } from "@/lib/db";

const CACHE_CAT = "__geocode_cache__";
const UA = "FreedomOffers-WarRoom/1.0 (info@freedom-offers.com)";

export type GeoPoint = { lat: number; lng: number };
type Cache = Record<string, GeoPoint | null>; // null = looked up, not found (don't retry)

export function normalizePlace(s: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9, ]/g, "").trim();
}

export async function readGeocache(): Promise<Cache> {
  const row = await db.resource.findFirst({ where: { category: CACHE_CAT } }).catch(() => null);
  if (!row?.description) return {};
  try { return JSON.parse(row.description) as Cache; } catch { return {}; }
}
async function writeGeocache(c: Cache): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: CACHE_CAT } });
  const description = JSON.stringify(c);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "geocode-cache", category: CACHE_CAT, url: "", description } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function geocodeOne(place: string): Promise<GeoPoint | null> {
  // Bias to the US; a bare ZIP or city resolves fine. One result is enough for a map pin.
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", /^\d{5}$/.test(place.trim()) ? place.trim() : `${place}, USA`);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");
  try {
    const res = await fetch(url.toString(), { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const r = rows?.[0];
    if (!r?.lat || !r?.lon) return null;
    const lat = Number(r.lat), lng = Number(r.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch { return null; }
}

/** Geocode up to `maxNew` places not already in the cache (rate-limited, cached). Returns
 *  counts so the caller can report progress and run again for the remainder. */
export async function geocodeBatch(places: string[], maxNew = 20): Promise<{ added: number; cached: number; remaining: number; total: number }> {
  const cache = await readGeocache();
  const distinct = [...new Set(places.map(normalizePlace).filter((p) => p.length >= 3))];
  const todo = distinct.filter((p) => !(p in cache));
  const batch = todo.slice(0, maxNew);
  let added = 0;
  for (let i = 0; i < batch.length; i++) {
    if (i > 0) await sleep(1100); // ≤1 req/sec per Nominatim policy
    cache[batch[i]] = await geocodeOne(batch[i]);
    if (cache[batch[i]]) added++;
  }
  if (batch.length) await writeGeocache(cache);
  return { added, cached: distinct.filter((p) => cache[p]).length, remaining: Math.max(0, todo.length - batch.length), total: distinct.length };
}

/** Resolve already-cached points for a set of places (NO external calls — safe on render). */
export function pointsFor(places: string[], cache: Cache): GeoPoint[] {
  const seen = new Set<string>();
  const out: GeoPoint[] = [];
  for (const raw of places) {
    const p = normalizePlace(raw);
    const hit = cache[p];
    if (hit && !seen.has(p)) { seen.add(p); out.push(hit); }
  }
  return out;
}

/** 🔎 Search a county or ZIP and return its BOUNDARY as a [lat,lng] ring (free OSM Nominatim
 *  with polygon_geojson). Falls back to the bounding box when no polygon exists (common for a
 *  bare ZIP). Simplified + capped so the saved territory stays small. */
export async function searchAreaBoundary(q: string): Promise<{ name: string; ring: [number, number][] } | null> {
  const query = q.trim();
  if (!query) return null;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", /^\d{5}$/.test(query) ? query : `${query}, USA`);
  url.searchParams.set("format", "json");
  url.searchParams.set("polygon_geojson", "1");
  url.searchParams.set("polygon_threshold", "0.01"); // simplify the boundary server-side
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");
  try {
    const res = await fetch(url.toString(), { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ display_name?: string; geojson?: { type?: string; coordinates?: unknown }; boundingbox?: string[] }>;
    const r = rows?.[0];
    if (!r) return null;
    const name = (r.display_name ?? query).split(",").slice(0, 2).join(",").trim();
    let ring: [number, number][] = [];
    const gj = r.geojson;
    const toRing = (coords: number[][]) => coords.filter((c) => Array.isArray(c) && c.length >= 2).map((c) => [c[1], c[0]] as [number, number]);
    if (gj?.type === "Polygon") ring = toRing((gj.coordinates as number[][][])[0] ?? []);
    else if (gj?.type === "MultiPolygon") ring = toRing(((gj.coordinates as number[][][][])[0] ?? [])[0] ?? []);
    if (ring.length < 3 && r.boundingbox && r.boundingbox.length === 4) {
      const [s, n, w, e] = r.boundingbox.map(Number); // south, north, west, east
      if ([s, n, w, e].every(Number.isFinite)) ring = [[s, w], [s, e], [n, e], [n, w]];
    }
    if (ring.length < 3) return null;
    if (ring.length > 300) { const step = Math.ceil(ring.length / 300); ring = ring.filter((_, i) => i % step === 0); }
    return { name, ring };
  } catch { return null; }
}

/** Pull distinct buy-box place strings from vetted buyers (cities / areas / zips). */
export function placesFromBuyBoxes(buyers: { buyBoxAreas?: string | null; market?: string | null }[]): string[] {
  const out: string[] = [];
  for (const b of buyers) {
    for (const chunk of `${b.buyBoxAreas ?? ""},${b.market ?? ""}`.split(/[,;/\n]+/)) {
      const t = chunk.trim();
      // keep real place-ish tokens (a 5-digit zip, or a word phrase ≥4 chars), drop noise
      if (/^\d{5}$/.test(t) || (t.length >= 4 && /[a-z]/i.test(t) && !/^\d+$/.test(t))) out.push(t);
    }
  }
  return [...new Set(out.map((s) => s.trim()))];
}
