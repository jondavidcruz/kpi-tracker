// 📗 Freedom Offers P&L — structure + math only. ⚠️ This repo is PUBLIC, so the REAL dollar figures
// are NEVER committed here — they live in the private Supabase DB (Resource category "__pnl_data__")
// and are read at request time (see loadPnl / readPnlData). This file holds only a zeroed 12-month
// skeleton (month order + shape) and the burn/runway/break-even math.
//
// Source of truth = Jon's accountant's Excel (Google Drive, owner enricofcruz@gmail.com, 12 month tabs
// "1-Jan 26" … "12-Dec 26"). The monthly "Monthly P&L Sync" task re-reads the sheet and, if its
// modifiedTime changed, re-parses the month totals and POSTs them to /api/admin/pnl → the DB row.
// Jon 2026-11-07: "always the same sheet — check it at the start of every month and update the War Room."

export const SHEET_ID = "1KqzRg6x_AgHD03g0Y5xOtGsVrTJ42zi8";
export const SHEET_URL = "https://docs.google.com/spreadsheets/d/1KqzRg6x_AgHD03g0Y5xOtGsVrTJ42zi8/edit";
export const SHEET_TITLE = "Freedom Offers P & L";
export const PNL_DATA_CAT = "__pnl_data__";     // Resource category holding the real figures
export const PNL_RUNWAY_CAT = "__pnl_runway__";  // Resource category holding owner assumptions

export type PnlMonth = {
  month: string;        // YYYY-MM
  revenue: number;      // net sales (actual) — only lands the month a deal closed
  expenses: number;     // grand total monthly expenses (actual)
  netProfit: number;    // revenue − expenses (actual)
  payroll: number;      // total payroll expenses
  software: number;     // total business setup cost (CRMs, dialers, tools)
  dues: number;         // total dues / licenses / membership
  realEstate: number;   // total real estate expenses (escrow, deeds, repairs)
  controllable: number; // total controllable expenses (car, travel, meals, office)
};

// Zeroed skeleton — defines the 12-month order and is the safe fallback before any sync has run.
// Change the year here each January; the real numbers come from the DB.
const YEAR = 2026;
export const PNL_SKELETON: PnlMonth[] = Array.from({ length: 12 }, (_, i) => ({
  month: `${YEAR}-${String(i + 1).padStart(2, "0")}`,
  revenue: 0, expenses: 0, netProfit: 0, payroll: 0, software: 0, dues: 0, realEstate: 0, controllable: 0,
}));

export type PnlStore = { year: number; asOf: string; sheetModified: string; months: PnlMonth[] };

/** Merge DB-stored months over the skeleton (keeps month order, fills any gaps with zeros). */
export function mergePnl(store: PnlStore | null): PnlMonth[] {
  if (!store?.months?.length) return PNL_SKELETON;
  const byMonth = new Map(store.months.map((m) => [m.month, m]));
  const year = store.year || YEAR;
  return Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    return byMonth.get(key) ?? { month: key, revenue: 0, expenses: 0, netProfit: 0, payroll: 0, software: 0, dues: 0, realEstate: 0, controllable: 0 };
  });
}

export type PnlAssumptions = {
  cashOnHand: number;   // bank balance today (owner-entered) — drives runway
  avgFee: number;       // avg assignment/profit per deal — drives "deals to close"
  profitTarget: number; // monthly profit goal on top of break-even
};
export const DEFAULT_ASSUMPTIONS: PnlAssumptions = { cashOnHand: 0, avgFee: 10000, profitTarget: 0 };

// A month is "closed" (real data) once it has any expense activity. Future/empty months are skipped
// from burn + averages so an un-filled November doesn't drag the burn rate to zero.
export function closedMonths(rows: PnlMonth[] = PNL_SKELETON): PnlMonth[] {
  return rows.filter((r) => r.expenses > 0);
}

export type PnlSummary = {
  burnRate: number;       // avg monthly expense over the last 3 closed months (the live run rate)
  burnAllAvg: number;     // avg monthly expense over ALL closed months
  lastClosed: PnlMonth | null;
  ytdRevenue: number; ytdExpenses: number; ytdNet: number;
  annualRunCost: number;  // burn × 12 — the cost to keep the business running for a year
  breakevenRevenue: number; // monthly revenue needed to stop losing money = burn
  dealsToBreakeven: number;  // breakeven ÷ avg fee
  dealsToTarget: number;     // (breakeven + profitTarget) ÷ avg fee
  runwayMonths: number | null; // cash ÷ burn (null until cash entered)
  closedCount: number;
};

export function summarize(assume: PnlAssumptions, rows: PnlMonth[] = PNL_SKELETON): PnlSummary {
  const closed = closedMonths(rows);
  const last3 = closed.slice(-3);
  const burnRate = last3.length ? last3.reduce((s, r) => s + r.expenses, 0) / last3.length : 0;
  const burnAllAvg = closed.length ? closed.reduce((s, r) => s + r.expenses, 0) / closed.length : 0;
  const ytdRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const ytdExpenses = rows.reduce((s, r) => s + r.expenses, 0);
  const ytdNet = ytdRevenue - ytdExpenses;
  const fee = assume.avgFee > 0 ? assume.avgFee : 10000;
  const breakevenRevenue = burnRate;
  return {
    burnRate, burnAllAvg, lastClosed: closed[closed.length - 1] ?? null,
    ytdRevenue, ytdExpenses, ytdNet,
    annualRunCost: burnRate * 12,
    breakevenRevenue,
    dealsToBreakeven: breakevenRevenue / fee,
    dealsToTarget: (breakevenRevenue + Math.max(0, assume.profitTarget)) / fee,
    runwayMonths: assume.cashOnHand > 0 && burnRate > 0 ? assume.cashOnHand / burnRate : null,
    closedCount: closed.length,
  };
}
