// Multi-year monthly history (imported 2024–2025 + future years). Raw inputs;
// ratios computed on read so they never drift.
import { db } from "./db";

export interface YearData {
  year: number;
  monthly: Record<string, (number | null)[]>; // metric -> 12 values (null = not tracked)
  total: Record<string, number>;
}

export async function getMonthlyHistory(): Promise<YearData[]> {
  const rows = await db.monthlyMetric.findMany({ orderBy: [{ year: "asc" }, { month: "asc" }] });
  const byYear = new Map<number, YearData>();
  for (const r of rows) {
    let yd = byYear.get(r.year);
    if (!yd) { yd = { year: r.year, monthly: {}, total: {} }; byYear.set(r.year, yd); }
    if (!yd.monthly[r.metric]) yd.monthly[r.metric] = Array(12).fill(null);
    yd.monthly[r.metric][r.month - 1] = r.value;
    yd.total[r.metric] = (yd.total[r.metric] ?? 0) + r.value;
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
