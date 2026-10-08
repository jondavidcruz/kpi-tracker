import { db } from "@/lib/db";

// 💰 Commission plans (Jon 2026-10-08, from the signed agreements).
// PRIVACY: a rep's plan is visible ONLY to that rep (their own /entry card)
// and to C-suite (team-roster is already C-suite-gated). Never render these
// numbers anywhere the rest of the team can see.
export type CommissionPlan = {
  goalMonthly: number;   // the rep's own monthly commission goal
  base: string;          // base pay line ("" = commission only)
  structure: string;     // how commission is earned
  payout: string;        // when it's paid
  pct: number;           // commission % of net profit (for the path-to-goal math)
  flatUnder?: number;    // flat $ paid when a deal nets under $5k (Nick)
};

export const DEFAULT_PLANS: Record<string, CommissionPlan> = {
  michelle: {
    goalMonthly: 500,
    base: "$3.00/hr base (~40 hrs/week) — paid the 15th + last day of each month via Wise",
    structure: "5% of Net Profit on every closed deal you put under contract (deals under $5,000 net still pay the standard 5%)",
    payout: "Commission is paid on the next payroll after the deal funds",
    pct: 0.05,
  },
  nick: {
    goalMonthly: 5000,
    base: "", // commission only
    structure: "20% of Net Profit on every closed deal you put under contract · deals under $5,000 net pay a flat $500",
    payout: "Paid when the wire clears — typically 1–3 business days after funding",
    pct: 0.2,
    flatUnder: 500,
  },
};

// A conservative average net per closed land deal — the path-to-goal math is
// labeled as an estimate and self-corrects as real closes stack up in /closing.
const AVG_NET_PER_DEAL = 10_000;

/** Turns the plan into "what your KPIs buy you" lines for the rep's card. */
export function pathToGoal(plan: CommissionPlan): string[] {
  const perDeal = Math.round(AVG_NET_PER_DEAL * plan.pct);
  const deals = Math.max(1, Math.ceil(plan.goalMonthly / perDeal));
  const lines = [
    `One closed deal at ~$${AVG_NET_PER_DEAL.toLocaleString()} net pays YOU ~$${perDeal.toLocaleString()} → ${deals} closed deal${deals > 1 ? "s" : ""}/month hits your $${plan.goalMonthly.toLocaleString()} goal.`,
    `Your daily KPIs above are that path: dials → connects → offers → contracts. Every contract you sign that closes is money in your pocket.`,
  ];
  if (plan.flatUnder) lines.push(`Smaller deals still pay — anything under $5,000 net is a flat $${plan.flatUnder} to you, so volume works too.`);
  return lines;
}

// Resource __commissions__ can override any field per rep (owner edits via
// Claude); empty strings in the stored row never clobber a good default.
export async function readCommissionPlans(): Promise<Record<string, CommissionPlan>> {
  const plans: Record<string, CommissionPlan> = JSON.parse(JSON.stringify(DEFAULT_PLANS));
  try {
    const row = await db.resource.findFirst({ where: { category: "__commissions__" } });
    if (row?.description) {
      const stored = JSON.parse(row.description) as Record<string, Partial<CommissionPlan>>;
      for (const [first, p] of Object.entries(stored)) {
        const cur = plans[first] ?? { goalMonthly: 0, base: "", structure: "", payout: "", pct: 0 };
        plans[first] = {
          goalMonthly: typeof p.goalMonthly === "number" && p.goalMonthly > 0 ? p.goalMonthly : cur.goalMonthly,
          base: p.base?.trim() ? p.base : cur.base,
          structure: p.structure?.trim() ? p.structure : cur.structure,
          payout: p.payout?.trim() ? p.payout : cur.payout,
          pct: typeof p.pct === "number" && p.pct > 0 ? p.pct : cur.pct,
          flatUnder: typeof p.flatUnder === "number" ? p.flatUnder : cur.flatUnder,
        };
      }
    }
  } catch { /* defaults stand */ }
  return plans;
}

export function planForUser(plans: Record<string, CommissionPlan>, fullName: string): CommissionPlan | null {
  const first = fullName.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return plans[first] ?? null;
}
