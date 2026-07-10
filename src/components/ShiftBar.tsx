import type { DayBar, BarState } from "@/lib/presence";

const COLOR: Record<BarState, string> = {
  work: "bg-emerald-500",
  break: "bg-amber-400",
  lunch: "bg-orange-400",
  meeting: "bg-violet-500",
  appointment: "bg-indigo-500",
  errand: "bg-sky-500",
  training: "bg-teal-500",
  outage: "bg-red-500",
  off: "bg-slate-200",
};
const LABEL: Record<BarState, string> = { work: "Working", break: "Break", lunch: "Lunch", meeting: "Meeting", appointment: "Appointment", errand: "Errand", training: "Training", outage: "Outage", off: "Off" };
const fmtMin = (m: number) => { const h = Math.floor((m % 1440) / 60); const mm = m % 60; const am = h < 12; const hr = h % 12 === 0 ? 12 : h % 12; return `${hr}:${String(mm).padStart(2, "0")} ${am ? "AM" : "PM"}`; };

// A techy, color-coded timeline of one person's day: clock-in → shift end, with each
// minute colored by status (work / break / lunch / outage / not-yet). Hover for times.
export default function ShiftBar({ bar }: { bar: DayBar }) {
  const span = Math.max(1, bar.endMin - bar.startMin);
  const nowPct = Math.min(100, Math.max(0, ((bar.nowMin - bar.startMin) / span) * 100));
  return (
    <div>
      <div className="relative flex h-3.5 w-full overflow-hidden rounded-full ring-1 ring-slate-200">
        {bar.segments.map((s, i) => (
          <div
            key={i}
            className={COLOR[s.state]}
            style={{ width: `${((s.endMin - s.startMin) / span) * 100}%` }}
            title={`${LABEL[s.state]} · ${fmtMin(s.startMin)}–${fmtMin(s.endMin)}`}
          />
        ))}
        {bar.nowMin > bar.startMin && bar.nowMin < bar.endMin && (
          <div className="absolute top-0 h-full w-0.5 bg-slate-900/70" style={{ left: `${nowPct}%` }} title={`Now · ${fmtMin(bar.nowMin)}`} />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-slate-400">
        <span>{fmtMin(bar.startMin)}</span>
        <span>{fmtMin(bar.endMin)}</span>
      </div>
    </div>
  );
}

export function ShiftBarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
      {(["work", "break", "lunch", "meeting", "appointment", "errand", "training", "outage", "off"] as BarState[]).map((s) => (
        <span key={s} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${COLOR[s]}`} /> {LABEL[s]}</span>
      ))}
    </div>
  );
}
