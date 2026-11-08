// 💪 Buying-power map layer (Jon 2026-11-08): paint the counties where our VETTED buyers want to
// buy as real green boundaries, so we instantly see where we have buying power vs. where we don't.
// Reuses the buyer-demand engine's per-county counts + the cached Census county boundaries
// (countyRing → TIGERweb, cached 90d). All free. Built server-side; the map just draws the rings.
import { countyRing } from "@/lib/geo/buyboxMap";

export type BuyerCoverage = { fips: string; name: string; buyers: number; newMarket: boolean; ring: [number, number][] };

/** Resolve the county boundary ring for each demand market (top N by buyer count). */
export async function buyerCoverageRings(
  markets: { fips: string; name: string; state: string; buyers: number; newMarket: boolean }[],
): Promise<BuyerCoverage[]> {
  const top = markets.slice(0, 25); // cap the boundary fetches
  const out: BuyerCoverage[] = [];
  await Promise.all(top.map(async (m) => {
    const county = `${m.name.replace(/ County$/i, "").trim()}, ${m.state}`;
    const ring = await countyRing(county).catch(() => null);
    if (ring && ring.length >= 3) out.push({ fips: m.fips, name: m.name, buyers: m.buyers, newMarket: m.newMarket, ring });
  }));
  return out;
}
