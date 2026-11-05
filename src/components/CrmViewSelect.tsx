"use client";
// 🔀 ONE CRM control (Jon 2026-11-05: "focus, smart views and the board dropdown are the same
// thing — merge them into one dropdown next to the pipeline, too much stuff on top"). A single
// dropdown: the top group switches the view FORMAT (Board/List/Week/Conversations/Velocity),
// the bottom group is the focus/working-list FILTER (Focus today / Due / Hot / …). Replaces the
// old separate view dropdown + Focus button + Smart-views chip row.
import { useRouter } from "next/navigation";

type Item = { val: string; label: string; href: string };
export default function CrmViewSelect({ groups, selected }: { groups: { label: string; items: Item[] }[]; selected: string }) {
  const router = useRouter();
  const byVal = new Map(groups.flatMap((g) => g.items).map((it) => [it.val, it.href]));
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[11px] font-bold text-slate-400">View</span>
      <select
        value={selected}
        onChange={(e) => { const href = byVal.get(e.target.value); if (href) router.push(href); }}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      >
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.items.map((it) => <option key={it.val} value={it.val}>{it.label}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
