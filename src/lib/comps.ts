// Address → ARV estimate + comparable sales, via RentCast (self-serve property API).
// Configure in Vercel with RENTCAST_API_KEY. No key = the feature stays dormant.
// Swappable: only this file talks to the provider.

export type Comp = {
  address: string;
  price: number;
  dom: number | null; // days on market
  beds: number | null;
  baths: number | null;
  sqft: number | null;
};

export type CompResult = {
  configured: boolean;
  arv?: number;
  arvLow?: number;
  arvHigh?: number;
  comps: Comp[];
  error?: string;
};

export function compsConfigured(): boolean {
  return !!process.env.RENTCAST_API_KEY;
}

export async function fetchComps(address: string): Promise<CompResult> {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) return { configured: false, comps: [] };
  try {
    const url = `https://api.rentcast.io/v1/avm/value?address=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { "X-Api-Key": key, accept: "application/json" } });
    if (res.status === 401) return { configured: true, comps: [], error: "RentCast API key was rejected (401). Check the key in Vercel." };
    if (res.status === 404) return { configured: true, comps: [], error: "No property/comps found for that address. Check the format." };
    if (!res.ok) return { configured: true, comps: [], error: `Comp lookup failed (${res.status}).` };
    const d = await res.json();
    const comps: Comp[] = (Array.isArray(d.comparables) ? d.comparables : [])
      .slice(0, 3)
      .map((c: Record<string, unknown>) => ({
        address: String(c.formattedAddress ?? ""),
        price: Math.round(Number(c.price ?? 0)),
        dom: Number.isFinite(Number(c.daysOnMarket)) ? Number(c.daysOnMarket) : null,
        beds: c.bedrooms != null ? Number(c.bedrooms) : null,
        baths: c.bathrooms != null ? Number(c.bathrooms) : null,
        sqft: c.squareFootage != null ? Number(c.squareFootage) : null,
      }));
    return {
      configured: true,
      arv: d.price != null ? Math.round(Number(d.price)) : undefined,
      arvLow: d.priceRangeLow != null ? Math.round(Number(d.priceRangeLow)) : undefined,
      arvHigh: d.priceRangeHigh != null ? Math.round(Number(d.priceRangeHigh)) : undefined,
      comps,
    };
  } catch {
    return { configured: true, comps: [], error: "Comp service network error." };
  }
}
