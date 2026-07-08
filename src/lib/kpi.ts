// KPI evaluation: performance status, goal resolution, and computed metrics.
// Shared by the dashboard UI and the alert engine so they never disagree.

import type { Kpi } from "@prisma/client";

export type Status = "hit" | "close" | "miss" | "none";

// Event-based outcome KPIs: lumpy results that only happen when a contract is
// actually sent/signed (or an offer is rejected) — NOT daily activities. The
// entry screen must not red-flag these as "needs entry" when blank, and they
// must never count toward the daily missing-entry nags. Reps fill them in only
// when the event occurs (and pick which contract type). Keep in sync with
// ALERT_EXCLUDE in alerts.ts.
export const EVENT_BASED_KPIS = new Set<string>([
  "acq_contracts_sent",
  "acq_signed_assignment",
  "acq_signed_novation",
  "acq_signed_listing",
  "acq_signed_creative",
  "offers_rejected",
]);

// Per-rep KPI swaps: some reps track a different channel than the rest of their
// role. Marie does Facebook outreach (not Instagram); Sharyn does Instagram (not
// Facebook). Keyed by first name (lowercase) → KPI keys that rep should NOT see.
const PER_REP_HIDDEN_KPIS: Record<string, string[]> = {
  marie: ["dev_instagram"],
  sharyn: ["dev_facebook"],
};

/** True if this KPI should be hidden for this person (per-rep channel swap). */
export function isKpiHiddenForRep(name: string, kpiKey: string): boolean {
  const fn = (name ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return (PER_REP_HIDDEN_KPIS[fn] ?? []).includes(kpiKey);
}

// A value is "close" if it's within this fraction of the goal but not at it.
const CLOSE_THRESHOLD = 0.8;

/** Performance of a value against a full goal (daily KPIs, or end-of-period). */
export function statusVsGoal(
  goalKind: string,
  value: number,
  goal: number | null,
): Status {
  if (goal === null || goalKind === "tracked") return "none";
  switch (goalKind) {
    case "at_most":
      if (value <= goal) return "hit";
      if (value <= goal * (2 - CLOSE_THRESHOLD)) return "close";
      return "miss";
    case "exact":
      return value === goal ? "hit" : "miss";
    case "at_least":
    default:
      if (value >= goal) return "hit";
      if (value >= goal * CLOSE_THRESHOLD) return "close";
      return "miss";
  }
}

/** Performance of a month-to-date value against the expected pace (goal × fraction). */
export function statusVsPace(
  goalKind: string,
  value: number,
  goal: number | null,
  fraction: number,
): Status {
  if (goal === null || goalKind === "tracked") return "none";
  const expected = goal * fraction;
  if (goalKind === "at_most") {
    if (value <= expected) return "hit";
    if (value <= expected * (2 - CLOSE_THRESHOLD)) return "close";
    return "miss";
  }
  if (expected <= 0) return "none";
  if (value >= expected) return "hit";
  if (value >= expected * CLOSE_THRESHOLD) return "close";
  return "miss";
}

/** Tailwind classes for a status (performance color, not the KPI category color). */
export function statusClasses(status: Status): {
  text: string;
  bg: string;
  border: string;
  dot: string;
  label: string;
} {
  switch (status) {
    case "hit":
      return { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500", label: "On goal" };
    case "close":
      return { text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500", label: "Close" };
    case "miss":
      return { text: "text-red-700", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500", label: "Behind" };
    case "none":
    default:
      return { text: "text-slate-500", bg: "bg-slate-50", border: "border-slate-200", dot: "bg-slate-300", label: "Tracked" };
  }
}

/** Category badge styling (your 🟢🔵🟡🔴 legend). */
export function categoryMeta(category: string): { label: string; cls: string } {
  switch (category) {
    case "green":
      return { label: "Money", cls: "bg-emerald-100 text-emerald-800" };
    case "blue":
      return { label: "Activity", cls: "bg-sky-100 text-sky-800" };
    case "yellow":
      return { label: "Visibility", cls: "bg-amber-100 text-amber-800" };
    case "red":
      return { label: "Not a metric", cls: "bg-red-100 text-red-800" };
    default:
      return { label: category, cls: "bg-slate-100 text-slate-700" };
  }
}

/** Does a miss on this KPI warrant an alert, and at what severity? */
export function alertSeverity(kpi: Pick<Kpi, "category">): "hard" | "soft" | null {
  if (kpi.category === "green") return "hard";
  if (kpi.category === "blue") return "soft";
  return null; // yellow / red never alert
}

// --- Computed monthly financial ratios (replaces #DIV/0! spreadsheet cells) ---

export interface MonthlyInputs {
  totalLeads: number;
  dealsClosed: number;
  grossRevenue: number;
  marketingSpend: number;
  operatingExpenses: number;
}

/** Returns a derived metric value, or null when it would divide by zero. */
export function computeDerived(formula: string, m: MonthlyInputs): number | null {
  const safe = (num: number, den: number) => (den === 0 ? null : num / den);
  switch (formula) {
    case "revenue_per_lead":
      return safe(m.grossRevenue, m.totalLeads);
    case "revenue_per_deal":
      return safe(m.grossRevenue, m.dealsClosed);
    case "cost_per_lead":
      return safe(m.marketingSpend, m.totalLeads);
    case "cost_per_deal":
      return safe(m.marketingSpend, m.dealsClosed);
    case "net_margin": {
      const net = m.grossRevenue - m.marketingSpend - m.operatingExpenses;
      const r = safe(net, m.grossRevenue);
      return r === null ? null : r * 100; // percent
    }
    case "marketing_roi":
      return safe(m.grossRevenue - m.marketingSpend, m.marketingSpend);
    case "company_roi":
      return safe(
        m.grossRevenue - m.marketingSpend - m.operatingExpenses,
        m.marketingSpend + m.operatingExpenses,
      );
    default:
      return null;
  }
}
