import type { DayTimeline } from "@/lib/presence";

const fmt = (ms: number, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

// Today's break + lunch history for one person — when each was taken and how long.
export default function BreakHistory({ timeline, tz, compact = false }: { timeline: DayTimeline; tz: string; compact?: boolean }) {
  const { segments, clockInMs, lastBreakEndMs, lastLunchEndMs } = timeline;
  if (!clockInMs && segments.length === 0) return null;
  const breaks = segments.filter((s) => s.type === "break");
  const lunches = segments.filter((s) => s.type === "lunch");
  const lastBack = Math.max(lastBreakEndMs ?? 0, lastLunchEndMs ?? 0) || null;

  return (
    <div className={compact ? "" : "rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200"}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {clockInMs && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">▶︎ In {fmt(clockInMs, tz)}</span>}
        {segments.map((s, i) => (
          <span key={i} className={`rounded-full px-2 py-0.5 font-medium ${s.type === "lunch" ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}`}>
            {s.type === "lunch" ? "🍽️" : "☕"} {fmt(s.startMs, tz)}{s.endMs ? `–${fmt(s.endMs, tz)}` : "…"} · {hm(s.min)}{s.endMs ? "" : " (ongoing)"}
          </span>
        ))}
        {segments.length === 0 && <span className="text-slate-400">No breaks logged yet today</span>}
      </div>
      {!compact && (
        <div className="mt-1.5 text-[11px] text-slate-400">
          {breaks.length} break{breaks.length === 1 ? "" : "s"}{lunches.length ? ` · ${lunches.length} lunch` : ""}
          {lastBack ? ` · last back at ${fmt(lastBack, tz)}` : ""}
        </div>
      )}
    </div>
  );
}
