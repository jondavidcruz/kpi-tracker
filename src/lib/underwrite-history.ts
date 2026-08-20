// Underwrite history — every exported offer, saved so we can score predictions
// against what actually closed (the calibration loop). Kept out of "use server".

export interface UwRec {
  id: string;
  at: string;          // ISO timestamp
  by: string;          // rep name
  tab: string;         // calculator mode
  market: string;      // MARKETS key
  address: string;
  mao: number;         // predicted max offer
  fee: number;         // predicted fee / spread / profit for us
  confidence: number;  // 0–100 evidence + checks score at export
  seconds: number | null; // underwrite time
}

/** Normalize an address for matching: lowercase, strip punctuation + unit noise. */
export function normAddr(a: string): string {
  return (a || "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\b(unit|apt|suite|ste)\b.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Loose match: same street number AND the street-name token appears in both. */
export function addrMatch(a: string, b: string): boolean {
  const na = normAddr(a), nb = normAddr(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const numA = na.match(/^\d+/)?.[0], numB = nb.match(/^\d+/)?.[0];
  if (!numA || numA !== numB) return false;
  const streetA = na.split(" ")[1], streetB = nb.split(" ")[1];
  return !!streetA && streetA === streetB;
}
