// 📍 Lead pins (Jon 2026-11-08): show WHERE our inbound seller leads are coming from, and where
// we've CLOSED land deals, by pinning them on the market map. Aggregates the Seller CRM opps by the
// ZIP in each lead's address (fewer unique points than full addresses → fast + cheap to geocode),
// counts leads + closed deals per ZIP, and resolves coordinates from the shared geocode cache (free,
// no external call on render). This closes the loop: pull area → leads land here → grade the market.
import { normalizePlace, type GeoPoint } from "@/lib/geocode";

export type LeadPin = { lat: number; lng: number; zip: string; leads: number; deals: number };

type Opp = { title?: string | null; stage?: string | null; contact?: { address?: string | null } | null };

const isWon = (stage?: string | null) => /won|closed|signed|sold/i.test(stage || "") && !/dead|lost|nurtur|dead/i.test(stage || "");

/** Aggregate seller opps → one pin per ZIP (cached coords only). uncachedZips = how many ZIPs still
 *  need a one-time geocode (surface a "map lead locations" button for them). */
export function buildLeadPins(opps: Opp[], cache: Record<string, GeoPoint | null>): { pins: LeadPin[]; uncachedZips: number } {
  const agg = new Map<string, { leads: number; deals: number }>();
  for (const o of opps) {
    const zip = ((o.contact?.address || "").match(/\b\d{5}\b/) || [])[0];
    if (!zip) continue;
    const a = agg.get(zip) ?? { leads: 0, deals: 0 };
    a.leads++; if (isWon(o.stage)) a.deals++;
    agg.set(zip, a);
  }
  const pins: LeadPin[] = [];
  let uncachedZips = 0;
  for (const [zip, a] of agg) {
    const key = normalizePlace(zip);
    const pt = cache[key];
    if (pt) pins.push({ lat: pt.lat, lng: pt.lng, zip, leads: a.leads, deals: a.deals });
    else if (!(key in cache)) uncachedZips++; // never looked up → geocodable
  }
  return { pins, uncachedZips };
}

/** The ZIP strings present in the seller opps (for the geocode button to resolve). */
export function leadZips(opps: Opp[]): string[] {
  const set = new Set<string>();
  for (const o of opps) { const z = ((o.contact?.address || "").match(/\b\d{5}\b/) || [])[0]; if (z) set.add(z); }
  return [...set];
}
