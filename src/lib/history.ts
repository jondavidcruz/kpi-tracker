// Multi-year monthly history (imported 2024–2025 + future years). Raw inputs;
// ratios computed on read so they never drift.
import { db } from "./db";

export interface YearData {
  year: number;
  monthly: Record<string, (number | null)[]>; // metric -> 12 values (null = not tracked)
  total: Record<string, number>;
}

export async function getMonthlyHistory(): Promise<YearData[]> {
  const [rows, deals] = await Promise.all([
    db.monthlyMetric.findMany({ orderBy: [{ year: "asc" }, { month: "asc" }] }),
    db.closedDeal.findMany(),
  ]);
  const byYear = new Map<number, YearData>();
  const ensure = (y: number) => {
    let yd = byYear.get(y);
    if (!yd) { yd = { year: y, monthly: {}, total: {} }; byYear.set(y, yd); }
    return yd;
  };
  // Activity + cost metrics from the imported monthly stats. revenue + sold_deals
  // are intentionally skipped here — the ClosedDeal ledger is their source of truth.
  for (const r of rows) {
    if (r.metric === "revenue" || r.metric === "sold_deals") continue;
    const yd = ensure(r.year);
    if (!yd.monthly[r.metric]) yd.monthly[r.metric] = Array(12).fill(null);
    yd.monthly[r.metric][r.month - 1] = r.value;
    yd.total[r.metric] = (yd.total[r.metric] ?? 0) + r.value;
  }
  // Deal profit + count straight from the HUD-verified closed-deal ledger.
  for (const d of deals) {
    const yd = ensure(d.year);
    for (const [metric, val] of [["revenue", d.profit], ["sold_deals", 1]] as const) {
      if (!yd.monthly[metric]) yd.monthly[metric] = Array(12).fill(null);
      yd.monthly[metric][d.month - 1] = (yd.monthly[metric][d.month - 1] ?? 0) + val;
      yd.total[metric] = (yd.total[metric] ?? 0) + val;
    }
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

/** Derived annual figures from the raw totals. */
export function derive(t: Record<string, number>) {
  const has = (k: string) => t[k] !== undefined;
  const revenue = t.revenue ?? 0;
  const expenses = t.expenses ?? 0;
  return {
    net: has("revenue") || has("expenses") ? revenue - expenses : null,
    costPerLead: has("expenses") && t.leads ? expenses / t.leads : null,
    profitPerDeal: has("revenue") && t.sold_deals ? revenue / t.sold_deals : null,
    connectRate: t.dials && t.connects ? t.connects / t.dials : null,
    leadPerConnect: t.connects && t.leads ? t.leads / t.connects : null,
  };
}
