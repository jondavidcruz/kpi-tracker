import { NextResponse } from "next/server";
import { getCurrentUser, canAccessMarketing } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// 🔎 Zillow-style city/county/ZIP autocomplete for the Target Markets map. Uses Photon
// (photon.komoot.io) — a free OSM geocoder built for type-ahead, no API key. Biased toward
// the FL/SC footprint and filtered to US results. The map flies to the picked place.
type Suggest = { label: string; sub: string; lat: number; lon: number };

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me || !canAccessMarketing(me)) return NextResponse.json({ error: "no access" }, { status: 403 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 3) return NextResponse.json({ items: [] });
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=29.5&lon=-82`;
    const r = await fetch(url, { headers: { "User-Agent": "FreedomOffersWarRoom/1.0 (info@freedom-offers.com)" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return NextResponse.json({ items: [] });
    const j = await r.json();
    const seen = new Set<string>();
    const items: Suggest[] = [];
    for (const f of (j?.features ?? [])) {
      const p = f?.properties ?? {};
      if (p.countrycode !== "US") continue;
      const coords = f?.geometry?.coordinates;
      const lon = Array.isArray(coords) ? Number(coords[0]) : NaN;
      const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const place = p.name || p.city || p.county || "";
      if (!place) continue;
      const label = [place, p.state].filter(Boolean).join(", ");
      if (seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      const sub = [p.county && p.county !== place ? p.county : "", p.osm_value].filter(Boolean).join(" · ");
      items.push({ label, sub, lat, lon });
      if (items.length >= 6) break;
    }
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, max-age=120" } });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
