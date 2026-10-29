// 📈 Listing / price history (Jon 2026-10-29). Jon checks Zillow for what a property was
// PREVIOUSLY listed / sold for — key to judging novation viability (can we list it higher
// than the last list price?). Captured as Zillow-style rows (date · event · price · source)
// so the info lives on the deal instead of only being eyeballed live. Stored on
// CrmOpportunity.formData.__listingHistory — no migration. Client-safe.

export type ListingRow = { date: string; event: string; price: string; source: string };

export const LISTING_EVENTS = [
  "Listed for sale", "Price change", "Pending", "Listing removed", "Back on market", "Sold", "Off market",
];

export function readListingHistory(formData: unknown): ListingRow[] {
  const raw = (formData as { __listingHistory?: unknown } | null)?.__listingHistory;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({ date: String(r.date ?? ""), event: String(r.event ?? ""), price: String(r.price ?? ""), source: String(r.source ?? "") }))
    .filter((r) => r.date || r.event || r.price);
}

/** Quick read: most recent "listed/price-change" price and most recent "sold" price. */
export function listingSummary(rows: ListingRow[]): { lastListed?: ListingRow; lastSold?: ListingRow } {
  const byDate = [...rows].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const lastListed = byDate.find((r) => /list|price change|back on market/i.test(r.event) && r.price);
  const lastSold = byDate.find((r) => /sold/i.test(r.event) && r.price);
  return { lastListed, lastSold };
}

/** Deep link to the property on Zillow (search by address) so the rep can pull the live history. */
export function zillowUrl(address?: string | null): string {
  const a = (address ?? "").trim();
  return a ? `https://www.zillow.com/homes/${encodeURIComponent(a)}_rb/` : "https://www.zillow.com/";
}
