// Owner-controlled sidebar ordering (Jon 2026-09-27: reorder the tabs himself,
// for the whole team, without asking). Stored as JSON in Resource __nav_order__:
// { groups: [labels in order], items: { [groupLabel]: [hrefs in order] } }.
// Anything not listed keeps its coded position, appended after ordered entries —
// so new pages never vanish just because the saved order predates them.
export const NAV_ORDER_CAT = "__nav_order__";

// moves: href → group label, for tabs the owner dragged OUT of their coded
// group (Jon 2026-10-04). Absent href = stays in its coded group.
// labels: href → custom tab name; groupLabels: coded group → custom name
// (Jon 2026-10-07: rename any sidebar field). Keys stay CODED everywhere —
// renames are display-only, so orders/moves/gates never break.
export type NavOrder = { groups: string[]; items: Record<string, string[]>; moves?: Record<string, string>; labels?: Record<string, string>; groupLabels?: Record<string, string> };

export function parseNavOrder(raw: string | null | undefined): NavOrder | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (v && Array.isArray(v.groups) && v.items && typeof v.items === "object") return v as NavOrder;
  } catch { /* corrupted order = coded order */ }
  return null;
}

/** Relocate moved items across groups BEFORE per-group ordering. Items moved to
 *  a group label that doesn't exist stay put (safe when a group is renamed). */
export function applyMoves<T>(groups: Array<{ label: string; items: T[] }>, moves: Record<string, string> | undefined, key: (t: T) => string): Array<{ label: string; items: T[] }> {
  if (!moves || Object.keys(moves).length === 0) return groups;
  const labels = new Set(groups.map((g) => g.label));
  const relocated: Record<string, T[]> = {};
  const gs = groups.map((g) => ({
    label: g.label,
    items: g.items.filter((it) => {
      const to = moves[key(it)];
      if (!to || to === g.label || !labels.has(to)) return true;
      (relocated[to] ??= []).push(it);
      return false;
    }),
  }));
  return gs.map((g) => (relocated[g.label] ? { ...g, items: [...g.items, ...relocated[g.label]] } : g));
}

/** Reorder `list` by `order` (matching on `key(item)`); unknowns keep relative order at the end. */
export function applyOrder<T>(list: T[], order: string[] | undefined, key: (t: T) => string): T[] {
  if (!order || order.length === 0) return list;
  const pos = new Map(order.map((k, i) => [k, i]));
  return [...list].sort((a, b) => {
    const pa = pos.has(key(a)) ? (pos.get(key(a)) as number) : order.length + list.indexOf(a);
    const pb = pos.has(key(b)) ? (pos.get(key(b)) as number) : order.length + list.indexOf(b);
    return pa - pb;
  });
}

/** Move `value` one step within `arr` (creating the canonical order if needed). */
export function moveInList(canonical: string[], saved: string[] | undefined, value: string, dir: -1 | 1): string[] {
  const base = saved && saved.length ? [...new Set([...saved, ...canonical.filter((c) => !saved.includes(c))])] : [...canonical];
  const i = base.indexOf(value);
  if (i < 0) return base;
  const j = i + dir;
  if (j < 0 || j >= base.length) return base;
  [base[i], base[j]] = [base[j], base[i]];
  return base;
}
