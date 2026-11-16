// 📊 Buyer ↔ Seller Market Index (Jon 2026-11-16, like Zillow's "Market index"). PURE + client-safe
// (NO server imports — lives in its own module so client components can import the function without
// dragging Prisma/DealMachine into the browser bundle). Computed entirely from fields the market
// scan already stores, so it costs zero extra API calls:
//   • days-to-pending (Zillow) — how fast demand absorbs supply (fast = seller's market)
//   • price YoY (Zillow)       — which way values are heading
//   • land-sales YoY (DealMachine trends) — is more or less land actually selling
//   • for-sale inventory percentile across the scanned set — raw supply (passed in by the caller)
// 0 = strong BUYER market (lots of supply, slow sales, soft prices → motivated sellers → GREAT to
// pull). 100 = strong SELLER market (tight supply, fast sales, rising prices → sellers have leverage).
import type { CountyScan } from "@/lib/market-scan"; // type-only (erased at build — no runtime pull)

export type MarketTilt = "strong-buyer" | "buyer" | "balanced" | "seller" | "strong-seller";
export type MarketIndex = { index: number; tilt: MarketTilt; label: string; repHint: string; parts: number };
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Compute one area's buyer↔seller index. `invPct` = this area's for-sale-inventory percentile
 *  (0..1) across the scanned set — the caller ranks it once and passes it in (optional). */
export function buyerSellerIndex(c: Pick<CountyScan, "daysToPending" | "yoyPct" | "trends">, invPct?: number | null): MarketIndex {
  const parts: Array<{ v: number; w: number }> = [];
  // days-to-pending: 15d or faster → 100 (seller); 90d or slower → 0 (buyer).
  if (c.daysToPending != null) parts.push({ v: clampN(100 - ((c.daysToPending - 15) / 75) * 100, 0, 100), w: 0.35 });
  // price YoY: +10% → 100, flat → 50, -10% → 0.
  if (c.yoyPct != null) parts.push({ v: clampN(50 + (c.yoyPct / 10) * 50, 0, 100), w: 0.30 });
  // land-sales YoY: +25% → 100, flat → 50, -25% → 0 (more land selling = stronger demand).
  if (c.trends?.yoyLandPct != null) parts.push({ v: clampN(50 + (c.trends.yoyLandPct / 25) * 50, 0, 100), w: 0.20 });
  // inventory percentile: more supply than peers → buyer's market (invert the percentile).
  if (invPct != null) parts.push({ v: clampN(100 - invPct * 100, 0, 100), w: 0.15 });
  const wsum = parts.reduce((s, p) => s + p.w, 0);
  const index = wsum ? Math.round(parts.reduce((s, p) => s + p.v * p.w, 0) / wsum) : 50;
  const tilt: MarketTilt = index >= 70 ? "strong-seller" : index >= 57 ? "seller" : index >= 43 ? "balanced" : index >= 30 ? "buyer" : "strong-buyer";
  const label = tilt === "strong-seller" ? "Strong seller market" : tilt === "seller" ? "Seller's market" : tilt === "balanced" ? "Balanced market" : tilt === "buyer" ? "Buyer's market" : "Strong buyer market";
  // Framed for a LAND WHOLESALER: a buyer's market = motivated sellers = a great area to pull.
  const repHint = index < 43
    ? "High supply, soft demand — motivated sellers. Strong area to pull & make offers."
    : index > 57
      ? "Tight market, sellers have leverage — expect harder negotiations, lead sharper on value."
      : "Even market — deals are there, win on speed and certainty of close.";
  return { index, tilt, label, repHint, parts: parts.length };
}
