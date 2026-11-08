// 🧾 Current Stack — the editable, go-forward monthly cost model (Jon 2026-11-07: "I want to edit any
// field, even the prices, to see our REAL stack from November forward — not the old stuff the Excel still
// shows all year"). This is separate from the Excel history (which stays immutable): it's a single
// owner-owned monthly list of what the business ACTUALLY pays now. Drives a go-forward burn / runway /
// break-even and a cut simulator. Lives in the private DB (Resource "__pnl_stack__") — repo is PUBLIC,
// so no real figures are committed here, only the shape + math.
import { PNL_CATS, type PnlCat } from "./pnl-sheet";

export const PNL_STACK_CAT = "__pnl_stack__";
const CAT_KEYS = new Set<PnlCat>(PNL_CATS.map((c) => c.key));

export type StackItem = {
  id: string;
  cat: PnlCat;
  label: string;
  amount: number;    // true current monthly cost
  person?: boolean;  // a team member (payroll headcount) vs a tool/expense
  paused?: boolean;  // currently not paid (e.g. Viktoriia's maternity) — excluded from run cost
  note?: string;
};
export type StackStore = { items: StackItem[]; updatedAt?: string; seededFrom?: string };

export function newId(): string { return Math.random().toString(36).slice(2, 9); }

/** Monthly run cost. Paused items are excluded unless includePaused; excludeIds simulates cuts. */
export function stackTotal(items: StackItem[], opts?: { excludeIds?: Set<string>; includePaused?: boolean }): number {
  return items.reduce((s, it) => {
    if (opts?.excludeIds?.has(it.id)) return s;
    if (it.paused && !opts?.includePaused) return s;
    return s + (Number(it.amount) || 0);
  }, 0);
}

export function stackByCat(items: StackItem[]): Record<PnlCat, StackItem[]> {
  const out = {} as Record<PnlCat, StackItem[]>;
  for (const c of PNL_CATS) out[c.key] = [];
  for (const it of items) { if (CAT_KEYS.has(it.cat)) out[it.cat].push(it); }
  return out;
}

/** Validate/clean an incoming items array (API write path). */
export function cleanStackItems(raw: unknown): StackItem[] {
  if (!Array.isArray(raw)) return [];
  const out: StackItem[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const cat = r?.cat as PnlCat;
    if (!CAT_KEYS.has(cat)) continue;
    const label = typeof r?.label === "string" ? r.label.trim().slice(0, 80) : "";
    if (!label) continue;
    const amount = Math.max(0, Math.min(10_000_000, Number(r?.amount) || 0));
    const it: StackItem = { id: typeof r?.id === "string" && r.id ? r.id.slice(0, 16) : newId(), cat, label, amount };
    if (r?.person === true) it.person = true;
    if (r?.paused === true) it.paused = true;
    if (typeof r?.note === "string" && r.note.trim()) it.note = r.note.trim().slice(0, 120);
    out.push(it);
    if (out.length >= 300) break;
  }
  return out;
}
