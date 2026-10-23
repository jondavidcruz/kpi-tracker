// 🎯 Developer / buyer-agent vetting readiness (Jon 2026-10-22, consolidation Phase 1).
// Makes the Dispo Developers/Agents kanban a real vetting system: a buy-box
// completeness score + A/B/C tier + what's still missing, computed from the CRM
// lead's own buy-box (formData.dev_buybox / agent_profile). This is the first step
// toward the CRM kanban being the single home for vetted developers (replacing the
// MarketContact Buyer Research). Pure + client-safe.

export type DevKind = "developer" | "buyer_agent";
export type DevVet = { filled: number; total: number; tier: "A" | "B" | "C"; missing: string[]; pct: number; responsive: boolean; hasPrice: boolean };

const has = (v: unknown): boolean => {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim().length > 0;
};

// The buy-box fields that matter for vetting, per kind. [label, value-getter-key].
// "key" fields (price + area) gate the A tier — a buyer we can't price or place isn't A.
const DEV_CHECKS: { label: string; key: string; core?: boolean }[] = [
  { label: "area", key: "buyCounties", core: true },
  { label: "price", key: "priceRange", core: true },
  { label: "land types", key: "landTypes" },
  { label: "lot size", key: "lotSize" },
  { label: "close speed", key: "closeSpeed" },
  { label: "proof of funds", key: "proofOfFunds" },
  { label: "decision maker", key: "decisionMaker" },
  { label: "volume", key: "volume" },
];
const AGENT_CHECKS: { label: string; key: string; core?: boolean }[] = [
  { label: "areas", key: "areas", core: true },
  { label: "price", key: "priceRange", core: true },
  { label: "buyer types", key: "buyerTypes" },
  { label: "brokerage", key: "brokerage" },
  { label: "best contact", key: "bestContact" },
  { label: "sends deals", key: "sendsDeals" },
];

export function devVetScore(formData: unknown, kind: DevKind, responsive = false): DevVet {
  const f = (formData ?? {}) as Record<string, Record<string, unknown>>;
  const box = (kind === "buyer_agent" ? f.agent_profile : f.dev_buybox) ?? {};
  const checks = kind === "buyer_agent" ? AGENT_CHECKS : DEV_CHECKS;
  const missing: string[] = [];
  let filled = 0;
  let hasPrice = false;
  for (const c of checks) {
    const ok = has(box[c.key]);
    if (ok) filled++; else missing.push(c.label);
    if (c.key === "priceRange" && ok) hasPrice = true;
  }
  const total = checks.length;
  const pct = Math.round((filled / total) * 100);
  // A = VIP developers (Jon 2026-10-22): super-responsive AND we have their purchase
  // price OR an almost-full buy-box. B = a decent box OR responsive. Else C.
  const almostFull = filled >= total - 2;
  const tier: DevVet["tier"] = responsive && (hasPrice || almostFull) ? "A"
    : filled >= Math.ceil(total / 2) || responsive ? "B"
    : "C";
  return { filled, total, tier, missing, pct, responsive, hasPrice };
}

export function devTierMeta(tier: DevVet["tier"]): { emoji: string; cls: string } {
  switch (tier) {
    case "A": return { emoji: "🅰", cls: "bg-emerald-100 text-emerald-700" };
    case "B": return { emoji: "🅱", cls: "bg-amber-100 text-amber-700" };
    default: return { emoji: "🅲", cls: "bg-slate-100 text-slate-500" };
  }
}
