// Closing Calculator records (Jon 2026-09-25): the ACTUAL numbers when a deal
// closes — deal outcome (moved here from the underwriting calculator) + the
// real, itemized closing costs — scored against the saved underwrite so we see
// how accurate the offer was. JSON side-store in Resource __closing_actuals__
// (no migration), capped at 200 records.

export const CLOSING_ACTUALS_CAT = "__closing_actuals__";

export type ClosingActual = {
  id: string;
  at: string; // ISO timestamp
  by: string; // who logged it
  address: string;
  exit: string; // assignment | double_close | novation | seller_finance | flip | other
  // Deal outcome (was the calculator's card)
  askPrice?: number;      // what the seller wanted
  contractPrice?: number; // what we locked with the seller (A→B)
  salePrice?: number;     // what it sold/assigned for (B→C)
  // Actual closing costs, itemized
  titleEscrow?: number;   // title + escrow fees
  transferTax?: number;
  recording?: number;
  backTaxes?: number;
  liens?: number;
  commissions?: number;   // agent commissions (novation/listing)
  concessions?: number;   // buyer credits / repairs given
  txnFunding?: number;    // transactional / gap funding (double close)
  other?: number;
  otherNote?: string;
  netFee?: number;        // actual net fee/profit banked (blank = computed)
  notes?: string;
};

export const COST_FIELDS: { key: keyof ClosingActual; label: string }[] = [
  { key: "titleEscrow", label: "Title + escrow" },
  { key: "transferTax", label: "Transfer tax" },
  { key: "recording", label: "Recording" },
  { key: "backTaxes", label: "Back taxes" },
  { key: "liens", label: "Liens / payoffs" },
  { key: "commissions", label: "Commissions" },
  { key: "concessions", label: "Concessions / credits" },
  { key: "txnFunding", label: "Transactional funding" },
  { key: "other", label: "Other" },
];

export const EXITS = ["assignment", "double_close", "novation", "seller_finance", "flip", "other"];

/** Sum of the itemized actual closing costs. */
export function actualClosingTotal(a: ClosingActual): number {
  return COST_FIELDS.reduce((s, f) => s + (Number(a[f.key]) || 0), 0);
}

/** Actual fee: typed netFee wins; else sale − contract − our closing costs. */
export function actualFee(a: ClosingActual): number | null {
  if (a.netFee && a.netFee !== 0) return a.netFee;
  if (a.salePrice && a.contractPrice) return Math.round(a.salePrice - a.contractPrice - actualClosingTotal(a));
  return null;
}

/** Accuracy verdict vs a prediction — same ±15% convention as /admin/calibration. */
export function accuracy(predicted: number, actual: number): { pct: number; verdict: "hot" | "cold" | "on" } {
  if (!(predicted > 0)) return { pct: 0, verdict: "on" };
  const pct = ((actual - predicted) / predicted) * 100;
  return { pct, verdict: pct > 15 ? "cold" : pct < -15 ? "hot" : "on" };
}
