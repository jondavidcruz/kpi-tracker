import { nextUsDstChange, dstReminder } from "@/lib/dst";

// 🕰 US ⇄ Philippines Daylight Saving reminder on the schedule/timecard (Jon 2026-11-13). A quiet
// line always shows the next change; a loud banner appears in the 2 weeks before so the Philippines
// team knows to reset their alarm (the US clock change shifts their US-anchored shift start by 1hr).
export default function DstReminder() {
  const change = nextUsDstChange();
  const r = dstReminder(change);
  const soon = change.daysUntil <= 14;

  if (!soon) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
        🕰 Next US Daylight Saving: <b>{r.when}</b> ({change.type === "spring" ? "spring forward" : "fall back"}, in {change.daysUntil} days).
        The 🇵🇭 Philippines team will need to shift their alarm {change.type === "spring" ? "earlier" : "later"} by 1 hour — a reminder appears here 2 weeks before.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-black text-amber-900">🕰 {r.title}</span>
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-800">in {change.daysUntil} day{change.daysUntil === 1 ? "" : "s"}</span>
      </div>
      <div className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed">
        <div className="rounded-lg bg-white px-3 py-2 text-slate-700 ring-1 ring-amber-100">{r.usNote}</div>
        <div className="rounded-lg bg-white px-3 py-2 font-semibold text-slate-800 ring-1 ring-amber-200">{r.phNote}</div>
      </div>
      <p className="mt-2 text-[11px] text-amber-700">The Philippines doesn&apos;t change its clocks — only the US does — so your US work hours land at a different Manila time. Adjust your alarm for the Monday after the change.</p>
    </div>
  );
}
