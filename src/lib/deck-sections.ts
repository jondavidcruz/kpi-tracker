// Monday deck "slide manager" — lets the owner reorder + show/hide the built-in
// cards on /meeting with no code (Jon 2026-11-09). The saved layout lives in a
// reserved Resource JSON row (category "__deck_layout__"), so no migration.
//
// These helpers are PURE (no db) so the client deck can apply the layout.
import type { Slide } from "@/components/Deck";

export const DECK_LAYOUT_CAT = "__deck_layout__";

export type DeckLayout = { order: string[]; hidden: string[] };

// The built-in sections in their DEFAULT order. The owner reorders/hides these.
// (Note: "Pass to Dad" sits just before the verse so the meeting hands off to Dad,
// then Dad takes it out on the word for the week.)
export const DECK_SECTIONS: { key: string; label: string; emoji: string; editable?: boolean }[] = [
  { key: "title", label: "Title / cover", emoji: "🖼️", editable: true },
  { key: "activity", label: "Team activity", emoji: "🎉" },
  { key: "team", label: "Meet the team", emoji: "👥", editable: true },
  { key: "stoplight", label: "Stoplight check", emoji: "🚦" },
  { key: "custom", label: "Your custom slides", emoji: "✨", editable: true },
  { key: "announcements", label: "Announcements", emoji: "📣", editable: true },
  { key: "kpis", label: "KPIs (per department)", emoji: "📊" },
  { key: "pipeline", label: "Active deal pipeline", emoji: "🏠" },
  { key: "recognition", label: "Recognition", emoji: "🏆" },
  { key: "training", label: "Training tips", emoji: "🎓" },
  { key: "closing", label: "Pass to Dad", emoji: "🙏", editable: true },
  { key: "verse", label: "Verse / message", emoji: "✝️" },
];

export const DECK_SECTION_KEYS = DECK_SECTIONS.map((s) => s.key);

/** Map a built slide to its section key, by its stable `name`. */
export function sectionOf(name: string, customTitles: string[]): string {
  if (name === "Title") return "title";
  if (name === "Team Building") return "activity";
  if (name === "Team") return "team";
  if (name === "Stoplight Check") return "stoplight";
  if (name === "Announcements") return "announcements";
  if (/ KPIs$/.test(name)) return "kpis";
  if (/^Active Pipeline/.test(name) || /^Active Deal Pipeline/.test(name)) return "pipeline";
  if (name === "Recognition") return "recognition";
  if (name === "Training Tips") return "training";
  if (name === "Verse of the week") return "verse";
  if (name === "That's the all-call" || name === "Talking point" || name === "Pass to Dad") return "closing";
  if (customTitles.includes(name)) return "custom";
  return "other";
}

/** The owner's saved order, reconciled with the full section list: saved keys
 *  first (in their order), then any sections they haven't moved, in default order. */
export function resolveOrder(order: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of order) if (DECK_SECTION_KEYS.includes(k) && !seen.has(k)) { out.push(k); seen.add(k); }
  for (const k of DECK_SECTION_KEYS) if (!seen.has(k)) { out.push(k); seen.add(k); }
  return out;
}

/** The section list the owner edits — current order + hidden flag per section. */
export function layoutSections(layout: DeckLayout): { key: string; label: string; emoji: string; editable?: boolean; hidden: boolean }[] {
  const meta = new Map(DECK_SECTIONS.map((s) => [s.key, s]));
  const hidden = new Set(layout.hidden ?? []);
  return resolveOrder(layout.order ?? []).map((key) => {
    const m = meta.get(key)!;
    return { key, label: m.label, emoji: m.emoji, editable: m.editable, hidden: hidden.has(key) };
  });
}

/** Reorder + hide the built slides per the owner's layout. Stable — within a
 *  section the slides keep their built order (so paginated KPIs/pipeline stay in
 *  sequence). An empty layout falls back to DECK_SECTIONS' default order. */
export function applyDeckLayout(slides: Slide[], layout: DeckLayout | undefined, customTitles: string[]): Slide[] {
  const hidden = new Set(layout?.hidden ?? []);
  const order = resolveOrder(layout?.order ?? []);
  const rank = (sec: string) => { const i = order.indexOf(sec); return i === -1 ? order.length + 1 : i; };
  return slides
    .map((sl, i) => ({ sl, i, sec: sectionOf(sl.name, customTitles) }))
    .filter((x) => !hidden.has(x.sec))
    .sort((a, b) => rank(a.sec) - rank(b.sec) || a.i - b.i)
    .map((x) => x.sl);
}
