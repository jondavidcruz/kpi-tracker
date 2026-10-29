// 🔥 Deal heat = how big the POTENTIAL SPREAD is (Jon 2026-10-29). NOT seller motivation —
// this is "based on the comps, how big a win is this deal." Jon eyeballs comps per deal and
// wants to flag the fat-spread ones ($50k–$100k) to prioritize and ignore the thin ones.
// Rated manually by one click on the card; stored on CrmOpportunity.formData.__spread
// (string, no migration). Client-safe.

export type DealHeat = "big" | "med" | "small" | "thin";

export const HEAT_META: Record<DealHeat, { emoji: string; label: string; short: string; cls: string; rank: number }> = {
  big:   { emoji: "🔥🔥🔥", label: "Big spread ($50k+) — prioritize", short: "Big spread", cls: "bg-red-100 text-red-700 ring-red-300", rank: 4 },
  med:   { emoji: "🔥🔥",   label: "Medium spread ($25–50k)",        short: "Medium",     cls: "bg-orange-100 text-orange-700 ring-orange-300", rank: 3 },
  small: { emoji: "🔥",     label: "Small spread (under $25k)",      short: "Small",      cls: "bg-amber-100 text-amber-700 ring-amber-300", rank: 2 },
  thin:  { emoji: "🧊",     label: "Thin / skip — not worth chasing", short: "Thin",       cls: "bg-sky-100 text-sky-700 ring-sky-300", rank: 1 },
};

const SEQ: (DealHeat | "")[] = ["", "big", "med", "small", "thin"];

export function readDealHeat(formData: unknown): DealHeat | "" {
  const v = (formData as { __spread?: unknown } | null)?.__spread;
  return v === "big" || v === "med" || v === "small" || v === "thin" ? v : "";
}

/** One click cycles: unrated → 🔥🔥🔥 → 🔥🔥 → 🔥 → 🧊 → unrated. */
export function cycleHeat(cur: DealHeat | ""): DealHeat | "" {
  const i = SEQ.indexOf(cur);
  return SEQ[(i + 1) % SEQ.length];
}

/** Sort weight for "hottest first" — big=4 … thin=1, unrated last. */
export function heatRank(h: DealHeat | ""): number {
  return h ? HEAT_META[h].rank : 0;
}
