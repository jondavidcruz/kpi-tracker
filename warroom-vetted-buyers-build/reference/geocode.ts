// Reference implementation — lib/geo/geocode.ts
// Provider fallback: Google → Mapbox → Nominatim. Always cache in GeoCache (prisma).
import { prisma } from "@/lib/prisma";

export type Geo = { lat: number; lng: number; formatted: string; county?: string; city?: string; state?: string; zip?: string; provider: string };

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const countyKey = (name?: string, st?: string) => name && st ? `${name.replace(/\s*county$/i, "").replace(/\s*parish$/i, "")}, ${st}` : undefined;

export async function geocode(input: string): Promise<Geo | null> {
  const key = norm(input);
  const cached = await prisma.geoCache.findUnique({ where: { key } });
  if (cached) return cached.result as Geo;
  const r = (await google(input)) ?? (await mapbox(input)) ?? (await nominatim(input));
  if (r) await prisma.geoCache.create({ data: { key, input, result: r as any } });
  return r;
}

async function google(q: string): Promise<Geo | null> {
  const k = process.env.GOOGLE_MAPS_API_KEY; if (!k) return null;
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=us&key=${k}`);
  const j = await res.json(); const r = j.results?.[0]; if (!r) return null;
  const comp = (t: string) => r.address_components.find((c: any) => c.types.includes(t));
  const st = comp("administrative_area_level_1")?.short_name;
  const cityName = comp("locality")?.long_name ?? comp("sublocality")?.long_name ?? comp("postal_town")?.long_name;
  return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, formatted: r.formatted_address, provider: "google",
    state: st, zip: comp("postal_code")?.long_name, city: cityName && st ? `${cityName}, ${st}` : undefined,
    county: countyKey(comp("administrative_area_level_2")?.long_name, st) };
}

async function mapbox(q: string): Promise<Geo | null> {
  const k = process.env.MAPBOX_TOKEN; if (!k) return null;
  const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=us&access_token=${k}`);
  const j = await res.json(); const f = j.features?.[0]; if (!f) return null;
  const ctx = (id: string) => [f, ...(f.context ?? [])].find((c: any) => c.id?.startsWith(id));
  const st = ctx("region")?.short_code?.replace("US-", "");
  const cityName = ctx("place")?.text;
  return { lat: f.center[1], lng: f.center[0], formatted: f.place_name, provider: "mapbox", state: st, zip: ctx("postcode")?.text,
    city: cityName && st ? `${cityName}, ${st}` : undefined, county: countyKey(ctx("district")?.text, st) };
}

let lastNom = 0;
async function nominatim(q: string): Promise<Geo | null> {
  const wait = 1100 - (Date.now() - lastNom); if (wait > 0) await new Promise(r => setTimeout(r, wait)); lastNom = Date.now();
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=us&limit=1&q=${encodeURIComponent(q)}`,
    { headers: { "User-Agent": "FreedomOffersWarRoom/1.0 (info@freedom-offers.com)" } });
  const j = await res.json(); const r = j?.[0]; if (!r) return null;
  const a = r.address ?? {}; const st = STATE_ABBR[a.state] ?? a.state;
  const cityName = a.city ?? a.town ?? a.village ?? a.hamlet;
  return { lat: +r.lat, lng: +r.lon, formatted: r.display_name, provider: "nominatim", state: st, zip: a.postcode,
    city: cityName && st ? `${cityName}, ${st}` : undefined, county: countyKey(a.county, st) };
}

const STATE_ABBR: Record<string, string> = { Alabama:"AL",Alaska:"AK",Arizona:"AZ",Arkansas:"AR",California:"CA",Colorado:"CO",Connecticut:"CT",Delaware:"DE",Florida:"FL",Georgia:"GA",Hawaii:"HI",Idaho:"ID",Illinois:"IL",Indiana:"IN",Iowa:"IA",Kansas:"KS",Kentucky:"KY",Louisiana:"LA",Maine:"ME",Maryland:"MD",Massachusetts:"MA",Michigan:"MI",Minnesota:"MN",Mississippi:"MS",Missouri:"MO",Montana:"MT",Nebraska:"NE",Nevada:"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND",Ohio:"OH",Oklahoma:"OK",Oregon:"OR",Pennsylvania:"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD",Tennessee:"TN",Texas:"TX",Utah:"UT",Vermont:"VT",Virginia:"VA",Washington:"WA","West Virginia":"WV",Wisconsin:"WI",Wyoming:"WY","District of Columbia":"DC" };

// prisma:
// model GeoCache { key String @id  input String  result Json  createdAt DateTime @default(now()) }
