// Auto-generated buy-box coverage map (Jon 2026-10-02: "see WHERE each
// developer buys, like Sharyn's hand-made maps"). Builds a Google Static Maps
// image per buyer from the structured buy box: county polygons shaded blue
// (boundaries from Census TIGERweb, simplified + cached forever), cities as
// red pins, a radius as a drawn circle. Sharyn's uploaded maps always win —
// this fills the gap for the buyers who don't have one.
import { fetchCached, getJson } from "@/lib/geo/fetchCached";
import { geocode } from "@/lib/geo/geocode";
import { regionCounties } from "@/lib/buybox/regions";
import type { BuyBox } from "@/lib/buybox/types";

const TIGER = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/11/query";
const URL_CAP = 8000; // Static Maps hard limit is 8192

const STATE_FIPS: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", FL: "12", GA: "13",
  HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23", MD: "24",
  MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31", NV: "32", NH: "33", NJ: "34",
  NM: "35", NY: "36", NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45",
  SD: "46", TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56",
};

/** Google encoded-polyline algorithm. */
export function encodePolyline(points: Array<[number, number]>): string {
  let out = "", prevLat = 0, prevLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (n >= 0x20) { s += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lat, lng] of points) {
    const la = Math.round(lat * 1e5), ln = Math.round(lng * 1e5);
    out += enc(la - prevLat) + enc(ln - prevLng);
    prevLat = la; prevLng = ln;
  }
  return out;
}

/** County boundary ring, simplified hard (±~2km) — cached forever per county. */
async function countyRing(county: string): Promise<Array<[number, number]> | null> {
  const m = county.match(/^(.+?),\s*([A-Za-z]{2})$/);
  if (!m) return null;
  const fips = STATE_FIPS[m[2].toUpperCase()];
  if (!fips) return null;
  const name = m[1].trim().replace(/'/g, "''");
  try {
    const data = await fetchCached<{ features?: Array<{ geometry?: { rings?: number[][][] } }> }>(
      "countyshape",
      { name: name.toLowerCase(), fips },
      () => getJson(`${TIGER}?where=${encodeURIComponent(`BASENAME='${name}' AND STATE='${fips}'`)}&outFields=BASENAME&returnGeometry=true&geometryPrecision=3&maxAllowableOffset=0.02&outSR=4326&f=json`),
    );
    const rings = data.features?.[0]?.geometry?.rings;
    if (!rings?.length) return null;
    const ring = [...rings].sort((a, b) => b.length - a.length)[0]; // mainland ring
    const step = Math.max(1, Math.ceil(ring.length / 90)); // ≤90 points per county
    return ring.filter((_, i) => i % step === 0).map(([lng, lat]) => [lat, lng] as [number, number]);
  } catch { return null; }
}

function circleRing(lat: number, lng: number, miles: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const dLat = miles / 69, dLng = miles / (69 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * 2 * Math.PI;
    pts.push([lat + dLat * Math.sin(a), lng + dLng * Math.cos(a)]);
  }
  return pts;
}

export type AutoMap = { url: string; counties: number; cities: number; sig: string };

/** Deterministic signature of the geo box — regenerate only when it changes. */
export function geoSig(geo: Partial<BuyBox["geo"]> | undefined): string {
  if (!geo) return "";
  return JSON.stringify([geo.counties ?? [], geo.cities ?? [], geo.zips ?? [], geo.regions ?? [], geo.radius ?? null, !!geo.nationwide]);
}

/** Build the coverage-map image URL for one buy box. Returns null when there's
 *  nothing drawable (empty box or nationwide-only). */
export async function buildAutoMap(geo: Partial<BuyBox["geo"]> | undefined): Promise<AutoMap | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !geo) return null;
  const counties = [...new Set([...(geo.counties ?? []), ...(geo.regions ?? []).flatMap((r) => regionCounties(r))])].slice(0, 10);
  const cities = (geo.cities ?? []).slice(0, 8);
  if (!counties.length && !cities.length && !geo.radius) return null;

  const parts: string[] = [];
  // Shaded county polygons — the "primary acquisition zone" look
  let drawn = 0;
  for (const c of counties) {
    const ring = await countyRing(c);
    if (!ring) continue;
    const p = `path=fillcolor:0x1d4ed826|color:0x1d4ed8cc|weight:2|enc:${encodePolyline(ring)}`;
    if (parts.join("&").length + p.length > URL_CAP - 600) break; // leave room for markers+key
    parts.push(p);
    drawn++;
  }
  // Radius → drawn circle (gold)
  if (geo.radius?.lat != null && geo.radius?.lng != null && geo.radius.miles) {
    parts.push(`path=fillcolor:0xc9a22722|color:0xc9a227cc|weight:2|enc:${encodePolyline(circleRing(geo.radius.lat, geo.radius.lng, geo.radius.miles))}`);
  }
  // Cities → red pins (geocoded through our cache)
  const cityPts: string[] = [];
  for (const city of cities) {
    const g = await geocode(city).catch(() => null);
    if (g) cityPts.push(`${g.lat.toFixed(4)},${g.lng.toFixed(4)}`);
  }
  if (cityPts.length) parts.push(`markers=color:red|size:mid|${cityPts.join("|")}`);
  if (!parts.length) return null;

  const url = `https://maps.googleapis.com/maps/api/staticmap?size=640x400&scale=2&maptype=roadmap&${parts.join("&")}&key=${key}`;
  if (url.length > 8192) return null;
  return { url, counties: drawn, cities: cityPts.length, sig: geoSig(geo) };
}
