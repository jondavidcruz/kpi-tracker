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
};

export const DEFAULT_PLANS: Record<string, CommissionPlan> = {
  michelle: {
    goalMonthly: 500,
    base: "$3.00/hr base (~40 hrs/week) — paid the 15th + last day of each month via Wise",
    structure: "5% of Net Profit on every closed deal you put under contract (deals under $5,000 net still pay the standard 5%)",
    payout: "Commission is paid on the next payroll after the deal funds",
  },
  nick: {
    goalMonthly: 5000,
    base: "", // commission only
    structure: "20% of Net Profit on every closed deal you put under contract · deals under $5,000 net pay a flat $500",
    payout: "Paid when the wire clears — typically 1–3 business days after funding",
  },
};

// Resource __commissions__ can override any field per rep (owner edits via
// Claude); empty strings in the stored row never clobber a good default.
export async function readCommissionPlans(): Promise<Record<string, CommissionPlan>> {
  const plans: Record<string, CommissionPlan> = JSON.parse(JSON.stringify(DEFAULT_PLANS));
  try {
    const row = await db.resource.findFirst({ where: { category: "__commissions__" } });
    if (row?.description) {
      const stored = JSON.parse(row.description) as Record<string, Partial<CommissionPlan>>;
      for (const [first, p] of Object.entries(stored)) {
        const cur = plans[first] ?? { goalMonthly: 0, base: "", structure: "", payout: "" };
        plans[first] = {
          goalMonthly: typeof p.goalMonthly === "number" && p.goalMonthly > 0 ? p.goalMonthly : cur.goalMonthly,
          base: p.base?.trim() ? p.base : cur.base,
          structure: p.structure?.trim() ? p.structure : cur.structure,
          payout: p.payout?.trim() ? p.payout : cur.payout,
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
