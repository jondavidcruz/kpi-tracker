// Geocoder with provider fallback + permanent cache (vetted-buyers rebuild,
// BUILD_SPEC §4.1). Provider order: Google (GOOGLE_MAPS_API_KEY) → Mapbox
// (MAPBOX_TOKEN) → Nominatim (free; custom User-Agent; ~1 req/s — callers doing
// batches must throttle). Every lookup (hits AND misses) is cached in GeoCache
// so we never pay or rate-limit twice. Accepts partial inputs: "Murfreesboro,
// TN", "Rutherford County TN", "37129".

import { db } from "@/lib/db";

export type GeoResult = {
  lat: number; lng: number; formatted: string;
  county: string; // "Rutherford, TN"
  city: string; state: string; zip: string;
};

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

async function fromCache(q: string): Promise<GeoResult | null | undefined> {
  const row = await db.geoCache.findUnique({ where: { query: q } }).catch(() => null);
  if (!row) return undefined; // not cached
  if (row.lat == null || row.lng == null) return null; // cached miss
  return { lat: row.lat, lng: row.lng, formatted: row.formatted, county: row.county, city: row.city, state: row.state, zip: row.zip };
}

async function writeCache(q: string, r: GeoResult | null, provider: string) {
  const data = {
    query: q, lat: r?.lat ?? null, lng: r?.lng ?? null, formatted: r?.formatted ?? "",
    county: r?.county ?? "", city: r?.city ?? "", state: r?.state ?? "", zip: r?.zip ?? "", provider,
  };
  await db.geoCache.upsert({ where: { query: q }, create: data, update: data }).catch(() => {});
}

const stripCounty = (s: string) => s.replace(/\s+county$/i, "").trim();

async function viaGoogle(input: string, key: string): Promise<GeoResult | null> {
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(input)}&components=country:US&key=${key}`);
  const j = await res.json();
  const g = j.results?.[0];
  if (!g) return null;
  const comp = (type: string, short = true) =>
    g.address_components?.find((c: { types: string[] }) => c.types.includes(type))?.[short ? "short_name" : "long_name"] ?? "";
  const state = comp("administrative_area_level_1");
  const countyRaw = stripCounty(comp("administrative_area_level_2", false));
  return {
    lat: g.geometry.location.lat, lng: g.geometry.location.lng, formatted: g.formatted_address ?? "",
    county: countyRaw && state ? `${countyRaw}, ${state}` : countyRaw,
    city: comp("locality", false) || comp("sublocality", false), state, zip: comp("postal_code"),
  };
}

async function viaMapbox(input: string, token: string): Promise<GeoResult | null> {
  const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(input)}.json?country=us&limit=1&access_token=${token}`);
  const j = await res.json();
  const f = j.features?.[0];
  if (!f) return null;
  const ctx = (id: string) => f.context?.find((c: { id: string }) => c.id.startsWith(id));
  const stateCode = (ctx("region")?.short_code ?? "").replace(/^US-/, "");
  const countyRaw = stripCounty(ctx("district")?.text ?? "");
  return {
    lat: f.center[1], lng: f.center[0], formatted: f.place_name ?? "",
    county: countyRaw && stateCode ? `${countyRaw}, ${stateCode}` : countyRaw,
    city: ctx("place")?.text ?? (f.place_type?.includes("place") ? f.text : ""),
    state: stateCode, zip: ctx("postcode")?.text ?? "",
  };
}

const STATE_ABBR: Record<string, string> = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY" };

async function viaNominatim(input: string): Promise<GeoResult | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=us&q=${encodeURIComponent(input)}`,
    { headers: { "User-Agent": "FreedomOffers-WarRoom/1.0 (info@freedom-offers.com)" } },
  );
  const j = await res.json();
  const f = Array.isArray(j) ? j[0] : null;
  if (!f) return null;
  const a = f.address ?? {};
  const stateFull = String(a.state ?? "").toLowerCase();
  const state = STATE_ABBR[stateFull] ?? "";
  const countyRaw = stripCounty(String(a.county ?? ""));
  return {
    lat: Number(f.lat), lng: Number(f.lon), formatted: f.display_name ?? "",
    county: countyRaw && state ? `${countyRaw}, ${state}` : countyRaw,
    city: a.city || a.town || a.village || a.hamlet || "", state, zip: a.postcode ?? "",
  };
}

/** Geocode with cache-first + provider fallback. Returns null on a true miss
 *  (which is also cached, so repeated bad inputs cost nothing). */
export async function geocode(input: string): Promise<GeoResult | null> {
  const q = norm(input);
  if (!q) return null;
  const cached = await fromCache(q);
  if (cached !== undefined) return cached;

  let r: GeoResult | null = null;
  let provider = "";
  try {
    if (process.env.GOOGLE_MAPS_API_KEY) { provider = "google"; r = await viaGoogle(q, process.env.GOOGLE_MAPS_API_KEY); }
    else if (process.env.MAPBOX_TOKEN) { provider = "mapbox"; r = await viaMapbox(q, process.env.MAPBOX_TOKEN); }
    else { provider = "nominatim"; r = await viaNominatim(q); }
  } catch { r = null; }
  await writeCache(q, r, provider);
  return r;
}
