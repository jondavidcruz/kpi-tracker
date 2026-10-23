// 🔥 Buyer heat scoring (Jon 2026-10-22). The dispo game is getting deals to the
// buyers who actually move — fast. This turns each vetted buyer's real activity
// (deals they're on, offers they've made/accepted, how recently we touched them)
// into a single heat score + tier, so the cascade + tracker surface the hottest
// buyers first instead of treating everyone the same. Pure + client-safe.

export type HeatTier = "hot" | "warm" | "cool" | "cold";

export type HeatSignals = {
  attachedDeals: number;   // # of live deals this buyer is attached to
  offersMade: number;      // offers they've put in across deals
  offersAccepted: number;  // offers that got accepted (strongest signal)
  repliesFollowing: number;// deal-tracker rows where they're "following_up"/"offer_in" (engaged)
  lastTouchYmd?: string;   // most recent contact date across all their deals (YYYY-MM-DD)
};

export type Heat = { score: number; tier: HeatTier; label: string; emoji: string; reasons: string[] };

const todayYmd = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

/** Days between a YYYY-MM-DD and today (PT). Large number if missing/unparseable. */
export function daysSince(ymd?: string): number {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return 9999;
  const a = Date.parse(ymd + "T00:00:00"); const b = Date.parse(todayYmd() + "T00:00:00");
  if (Number.isNaN(a) || Number.isNaN(b)) return 9999;
  return Math.max(0, Math.round((b - a) / 86400000));
}

const TIERS: { tier: HeatTier; min: number; label: string; emoji: string }[] = [
  { tier: "hot", min: 70, label: "Hot", emoji: "🔥" },
  { tier: "warm", min: 40, label: "Warm", emoji: "🌤" },
  { tier: "cool", min: 15, label: "Cool", emoji: "🌥" },
  { tier: "cold", min: 0, label: "Cold", emoji: "❄️" },
];

/** Score 0–100 from the signals + the reasons behind it. Weighted toward "has
 *  put real money on deals" and "we talked to them recently". */
export function buyerHeat(s: HeatSignals): Heat {
  const reasons: string[] = [];
  let score = 0;

  // accepted offers — the buyer actually transacts (huge)
  if (s.offersAccepted > 0) { score += Math.min(40, 25 + s.offersAccepted * 15); reasons.push(`${s.offersAccepted} accepted offer${s.offersAccepted > 1 ? "s" : ""}`); }
  // offers made — active bidder
  if (s.offersMade > 0) { score += Math.min(25, s.offersMade * 9); reasons.push(`${s.offersMade} offer${s.offersMade > 1 ? "s" : ""} made`); }
  // engaged on deals (following up / offer in)
  if (s.repliesFollowing > 0) { score += Math.min(15, s.repliesFollowing * 6); reasons.push(`engaged on ${s.repliesFollowing} deal${s.repliesFollowing > 1 ? "s" : ""}`); }
  // attached to live deals — in the mix
  if (s.attachedDeals > 0) { score += Math.min(12, s.attachedDeals * 3); reasons.push(`on ${s.attachedDeals} live deal${s.attachedDeals > 1 ? "s" : ""}`); }
  // recency — a hot buyer we talked to this week beats one we haven't touched in a month
  const d = daysSince(s.lastTouchYmd);
  if (d <= 2) { score += 15; reasons.push("touched in last 2 days"); }
  else if (d <= 7) { score += 10; reasons.push("touched this week"); }
  else if (d <= 14) { score += 4; }
  else if (d <= 30) { score += 0; }
  else if (s.attachedDeals > 0 || s.offersMade > 0) { score -= 8; reasons.push("going quiet — no touch in a month"); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const t = TIERS.find((x) => score >= x.min) ?? TIERS[TIERS.length - 1];
  return { score, tier: t.tier, label: t.label, emoji: t.emoji, reasons };
}

export function heatTierMeta(tier: HeatTier): { label: string; emoji: string; cls: string } {
  switch (tier) {
    case "hot": return { label: "Hot", emoji: "🔥", cls: "bg-rose-100 text-rose-700" };
    case "warm": return { label: "Warm", emoji: "🌤", cls: "bg-amber-100 text-amber-700" };
    case "cool": return { label: "Cool", emoji: "🌥", cls: "bg-sky-100 text-sky-700" };
    default: return { label: "Cold", emoji: "❄️", cls: "bg-slate-100 text-slate-500" };
  }
}
