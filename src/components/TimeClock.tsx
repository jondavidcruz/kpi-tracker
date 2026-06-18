"use client";

import { useEffect, useState } from "react";
import { punch } from "@/app/actions";

type State = "online" | "break" | "lunch" | "offline";

const STATUS: Record<State, { label: string; cls: string }> = {
  online: { label: "🟢 Clocked in", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  break: { label: "🟡 On break", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  lunch: { label: "🟡 At lunch", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  offline: { label: "⚪️ Day ended", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
};

function hm(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function PunchButton({ kind, label, cls }: { kind: string; label: string; cls: string }) {
  return (
    <form action={punch}>
      <input type="hidden" name="kind" value={kind} />
      <button className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${cls}`}>{label}</button>
    </form>
  );
}

export default function TimeClock({
  state,
  sinceMs,
  workedMin,
  nowMs,
  capMs,
  shiftEndLabel,
}: {
  state: State;
  sinceMs: number | null;
  workedMin: number;
  nowMs: number;
  capMs?: number | null;
  shiftEndLabel?: string | null;
}) {
  const [extra, setExtra] = useState(0);
  const [pastShift, setPastShift] = useState(false);
  useEffect(() => {
    if (state !== "online") {
      setExtra(0);
      // Still flag if they're sitting on break/lunch past shift end.
      setPastShift(state !== "offline" && capMs != null && Date.now() > capMs);
      return;
    }
    const tick = () => {
      // Freeze the running clock at the shift cap — never count past shift end.
      const liveNow = capMs != null ? Math.min(Date.now(), capMs) : Date.now();
      setExtra(Math.max(0, Math.floor((liveNow - nowMs) / 60000)));
      setPastShift(capMs != null && Date.now() > capMs);
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, [state, nowMs, capMs]);

  const total = workedMin + (state === "online" ? extra : 0);
  const since = sinceMs ? new Date(sinceMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  const s = STATUS[state];

  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">⏱️ My time card</h3>
          <p className="text-sm text-slate-500">
            Worked today: <strong className="tabular-nums">{hm(total)}</strong>
            {shiftEndLabel ? <span className="text-slate-400"> · shift ends {shiftEndLabel}</span> : null}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${s.cls}`}>
          {s.label}{since && state !== "offline" ? ` · since ${since}` : ""}
        </span>
      </div>

      {pastShift && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          ⚠️ You're still clocked in past your shift end{shiftEndLabel ? ` (${shiftEndLabel})` : ""}. Press
          <strong> End of day</strong> so your hours stay accurate. Your time stops counting at shift end either way —
          forgotten sessions are auto-closed, so you're never over-counted.
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {state === "offline" && (
          <PunchButton kind="in" label="▶︎ Clock In" cls="bg-emerald-600 text-white hover:bg-emerald-700" />
        )}
        {state === "online" && (
          <>
            <PunchButton kind="break_start" label="☕ Start break" cls="bg-amber-400 text-amber-950 hover:bg-amber-500" />
            <PunchButton kind="lunch_start" label="🍽️ Start lunch" cls="bg-amber-400 text-amber-950 hover:bg-amber-500" />
            <PunchButton kind="out" label="■ End of day" cls="bg-slate-800 text-white hover:bg-slate-900" />
          </>
        )}
        {state === "break" && (
          <>
            <PunchButton kind="break_end" label="↩︎ End break — back to work" cls="bg-emerald-600 text-white hover:bg-emerald-700" />
            <PunchButton kind="out" label="■ End of day" cls="bg-slate-800 text-white hover:bg-slate-900" />
          </>
        )}
        {state === "lunch" && (
          <>
            <PunchButton kind="lunch_end" label="↩︎ End lunch — back to work" cls="bg-emerald-600 text-white hover:bg-emerald-700" />
            <PunchButton kind="out" label="■ End of day" cls="bg-slate-800 text-white hover:bg-slate-900" />
          </>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Your status is saved on the server — close the tab and come back anytime, your clock keeps running until you press
        End of day.
      </p>
    </div>
  );
}
