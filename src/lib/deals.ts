// Deal aging analysis: how long a deal has been on the market, and what to do
// about it. Drives the board badges, the report, and the aging alerts.
import type { Deal } from "@prisma/client";

// Aggressive thresholds (days on market) — tuned for fast wholesale/novation.
export const AGING = {
  priceCheck: 7, // day 7: sanity-check the price / marketing
  reduction: 21, // day 21: recommend a price reduction
  stale: 30, // day 30: stale — escalate
};

export type AgingLevel = "fresh" | "watch" | "reduce" | "stale";

/** Whole days between a "YYYY-MM-DD" date and today (UTC). Null if no/blank date. */
export function daysSince(dateStr: string, today: string): number | null {
  if (!dateStr) return null;
  const a = Date.parse(dateStr + "T00:00:00Z");
  const b = Date.parse(today + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

/** The clock for "on market" — prefer onMarketSince, fall back to contract date. */
export function marketDate(deal: Deal): string {
  return deal.onMarketSince || deal.contractDate || "";
}

export interface DealAging {
  days: number | null; // days on market (null if unknown)
  level: AgingLevel;
  recommendation: string; // what to do about it
  contractDaysLeft: number | null; // days until our contract with the seller expires
  listingDaysLeft: number | null; // days until the listing agreement expires
}

/** Analyze a single deal's aging + expirations. Only meaningful for live deals. */
export function analyzeDeal(deal: Deal, today: string): DealAging {
  const days = daysSince(marketDate(deal), today);
  const contractDaysLeft = negDays(deal.contractExpiration, today);
  const listingDaysLeft = negDays(deal.listingExpiration, today);

  let level: AgingLevel = "fresh";
  let recommendation = "On track. Keep marketing.";

  if (days !== null) {
    if (days >= AGING.stale) {
      level = "stale";
      recommendation = `On market ${days} days, STALE. Escalate: consider a meaningful price reduction, switch buyers list, or re-trade the seller.`;
    } else if (days >= AGING.reduction) {
      level = "reduce";
      recommendation = `On market ${days} days. Recommend a price reduction to drive activity.`;
    } else if (days >= AGING.priceCheck) {
      level = "watch";
      recommendation = `On market ${days} days. Sanity-check pricing & marketing; push the buyers list.`;
    }
  }

  // Expiration warnings override the marketing nudge when urgent.
  if (contractDaysLeft !== null && contractDaysLeft <= 7) {
    recommendation =
      contractDaysLeft < 0
        ? `⚠️ Seller contract EXPIRED ${Math.abs(contractDaysLeft)}d ago. Extend or release now.`
        : `⚠️ Seller contract expires in ${contractDaysLeft}d. Get an extension or close fast. ` + recommendation;
  }

  return { days, level, recommendation, contractDaysLeft, listingDaysLeft };
}

/** Signed days remaining until a future "YYYY-MM-DD" (negative if past). */
function negDays(dateStr: string, today: string): number | null {
  if (!dateStr) return null;
  const a = Date.parse(dateStr + "T00:00:00Z");
  const b = Date.parse(today + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

export function agingClasses(level: AgingLevel): string {
  switch (level) {
    case "stale":
      return "bg-red-100 text-red-700";
    case "reduce":
      return "bg-amber-100 text-amber-700";
    case "watch":
      return "bg-sky-100 text-sky-700";
    default:
      return "bg-emerald-100 text-emerald-700";
  }
}

/** Deals that warrant an aging alert (live, on market past the watch threshold). */
export function dealsNeedingAttention(deals: Deal[], today: string) {
  return deals
    .filter((d) => d.active && !["dead", "closed"].includes(d.status))
    .map((d) => ({ deal: d, aging: analyzeDeal(d, today) }))
    .filter(
      (x) =>
        (x.aging.days !== null && x.aging.days >= AGING.priceCheck) ||
        (x.aging.contractDaysLeft !== null && x.aging.contractDaysLeft <= 7),
    )
    .sort((a, b) => (b.aging.days ?? 0) - (a.aging.days ?? 0));
}
