"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";

// The Level 10 agenda is time-boxed: the meeting SHOULD be on a given segment by a given
// minute. These mins MIRROR the <Seg> blocks in L10Agenda.tsx (keep them in sync) — total 30.
const SEGMENTS: { name: string; min: number }[] = [
  { name: "Segue", min: 2 },
  { name: "Scorecard", min: 4 },
  { name: "Rock Review", min: 4 },
  { name: "Headlines", min: 2 },
  { name: "To-Do List", min: 3 },
  { name: "IDS — solve issues", min: 13 },
  { name: "Conclude & rate", min: 2 },
];
const TOTAL_MIN = SEGMENTS.reduce((s, x) => s + x.min, 0);

function mmss(sec: number) {
  const over = sec < 0;
  const s = Math.abs(Math.round(sec));
  return `${over ? "+" : ""}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Live 30-minute countdown for the L10 — keeps the leadership meeting tight, like the best-run
 *  teams: start on time, time-box each segment, end on time. Pure client, no data. */
export default function L10Timer() {
  const [elapsed, setElapsed] = useState(0); // seconds
  const [running, setRunning] = useState(false);
  const startRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now() - elapsed * 1000;
    const id = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // Cumulative end (seconds) of each segment → which segment we SHOULD be on now.
  let acc = 0;
  const bounds = SEGMENTS.map((s) => ({ ...s, start: acc, end: (acc += s.min * 60) }));
  const idx = bounds.findIndex((b) => elapsed < b.end);
  const curIdx = idx === -1 ? SEGMENTS.length - 1 : idx;
  const cur = bounds[curIdx];
  const segElapsed = elapsed - cur.start;
  const segRemain = cur.min * 60 - segElapsed;
  const totalRemain = TOTAL_MIN * 60 - elapsed;
  const segPct = Math.min(100, Math.max(0, (segElapsed / (cur.min * 60)) * 100));
  const tone = (sec: number) => (sec < 0 ? "text-red-600" : sec <= 60 ? "text-amber-600" : "text-emerald-600");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-right leading-none">
          <div className={`text-2xl font-extrabold tabular-nums ${tone(totalRemain)}`}>{mmss(totalRemain)}</div>
          <div className="text-[10px] font-semibold text-slate-400">of {TOTAL_MIN}:00 left</div>
        </div>
        <div className="h-9 w-px bg-slate-200" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-slate-800">{curIdx + 1}. {cur.name}</span>
            <span className={`text-xs font-semibold tabular-nums ${tone(segRemain)}`}>{segRemain < 0 ? `${mmss(segRemain)} over` : `${mmss(segRemain)} left`}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full rounded-full ${segRemain < 0 ? "bg-red-500" : segRemain <= 60 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${segPct}%` }} />
          </div>
        </div>
        <button onClick={() => setRunning((r) => !r)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white ${running ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
          {running ? <><Pause size={14} /> Pause</> : <><Play size={14} /> {elapsed > 0 ? "Resume" : "Start"}</>}
        </button>
        <button onClick={() => { setRunning(false); setElapsed(0); }} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-500 ring-1 ring-slate-300 hover:bg-slate-100" title="Reset">
          <RotateCcw size={14} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {bounds.map((b, i) => (
          <span key={i} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${i < curIdx ? "bg-slate-100 text-slate-400 line-through" : i === curIdx ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-500"}`}>
            {b.name} {b.min}m
          </span>
        ))}
      </div>
    </div>
  );
}
