"use client";

import { useEffect, useState } from "react";
import { punch } from "@/app/actions";

type State = "online" | "break" | "lunch" | "meeting" | "appointment" | "errand" | "training" | "bathroom" | "offline";

const STATUS: Record<State, { label: string; cls: string }> = {
  online: { label: "🟢 Clocked in", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  break: { label: "🟡 On break", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  lunch: { label: "🟡 At lunch", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  meeting: { label: "🟣 In a meeting", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  appointment: { label: "🗓️ At an appointment", cls: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  errand: { label: "🚗 Running an errand", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  training: { label: "🎓 In training", cls: "bg-teal-50 text-teal-700 ring-teal-200" },
  bathroom: { label: "💩 Bathroom break", cls: "bg-stone-100 text-stone-700 ring-stone-300" },
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

// A greyed-out preview of an action that isn't available yet (e.g. Break before
// you've clocked in) — so the team can see the full set of buttons up front.
function GhostButton({ label, title }: { label: string; title: string }) {
  return (
    <button
      disabled
      title={title}
      className="cursor-not-allowed rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-300"
    >
      {label}
    </button>
  );
}

export default function TimeClock({
  state,
  sinceMs,
  workedMin,
  nowMs,
  capMs,
  shiftEndLabel,
  showLunch = true,
}: {
  state: State;
  sinceMs: number | null;
  workedMin: number;
  nowMs: number;
  capMs?: number | null;
  shiftEndLabel?: string | null;
  showLunch?: boolean;
}) {
  const [extra, setExtra] = useState(0);
  const [pastShift, setPastShift] = useState(false);
  const [contMin, setContMin] = useState(0); // minutes online without a break, right now
  useEffect(() => {
    if (state !== "online") {
      setExtra(0);
      setContMin(0);
      // Still flag if they're sitting on break/lunch past shift end.
      setPastShift(state !== "offline" && capMs != null && Date.now() > capMs);
      return;
    }
    const tick = () => {
      // Freeze the running clock at the shift cap — never count past shift end.
      const liveNow = capMs != null ? Math.min(Date.now(), capMs) : Date.now();
      setExtra(Math.max(0, Math.floor((liveNow - nowMs) / 60000)));
      setPastShift(capMs != null && Date.now() > capMs);
      setContMin(sinceMs ? Math.max(0, Math.floor((Date.now() - sinceMs) / 60000)) : 0);
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, [state, nowMs, capMs, sinceMs]);

  // Health nudge: been heads-down for 100+ min without a break.
  const needsBreak = state === "online" && contMin >= 100;

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

      {needsBreak && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          ☕ You&apos;ve been heads-down for <strong>{hm(contMin)}</strong> straight — take a quick break to reset. Tap <strong>Start break</strong>{showLunch ? " or Start lunch" : ""} when you step away.
        </div>
      )}

      {pastShift && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          ⚠️ You're still clocked in past your shift end{shiftEndLabel ? ` (${shiftEndLabel})` : ""}. Press
          <strong> End of day</strong> so your hours stay accurate. Your time stops counting at shift end either way —
          forgotten sessions are auto-closed, so you're never over-counted.
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {state === "offline" && (
          <>
            <PunchButton kind="in" label="▶︎ Clock In" cls="bg-emerald-600 text-white hover:bg-emerald-700" />
            <GhostButton label="☕ Start break" title="Available once you clock in" />
            {showLunch && <GhostButton label="🍽️ Start lunch" title="Available once you clock in" />}
            <GhostButton label="■ End of day" title="Available once you clock in" />
          </>
        )}
        {state === "online" && (
          <>
            <PunchButton kind="break_start" label="☕ Start break" cls="bg-amber-400 text-amber-950 hover:bg-amber-500" />
            {showLunch && <PunchButton kind="lunch_start" label="🍽️ Start lunch" cls="bg-amber-400 text-amber-950 hover:bg-amber-500" />}
            <PunchButton kind="meeting_start" label="📅 In a meeting" cls="bg-violet-500 text-white hover:bg-violet-600" />
            <PunchButton kind="appointment_start" label="🗓️ Appointment" cls="bg-indigo-500 text-white hover:bg-indigo-600" />
            <PunchButton kind="errand_start" label="🚗 Errand" cls="bg-sky-500 text-white hover:bg-sky-600" />
            <PunchButton kind="training_start" label="🎓 Training" cls="bg-teal-500 text-white hover:bg-teal-600" />
            <PunchButton kind="bathroom_start" label="💩 Bathroom" cls="bg-stone-500 text-white hover:bg-stone-600" />
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
        {state === "meeting" && (
          <>
            <PunchButton kind="meeting_end" label="↩︎ End meeting — back to work" cls="bg-emerald-600 text-white hover:bg-emerald-700" />
            <PunchButton kind="out" label="■ End of day" cls="bg-slate-800 text-white hover:bg-slate-900" />
          </>
        )}
        {state === "appointment" && (
          <>
            <PunchButton kind="appointment_end" label="↩︎ Back from appointment" cls="bg-emerald-600 text-white hover:bg-emerald-700" />
            <PunchButton kind="out" label="■ End of day" cls="bg-slate-800 text-white hover:bg-slate-900" />
          </>
        )}
        {state === "errand" && (
          <>
            <PunchButton kind="errand_end" label="↩︎ Back from errand" cls="bg-emerald-600 text-white hover:bg-emerald-700" />
            <PunchButton kind="out" label="■ End of day" cls="bg-slate-800 text-white hover:bg-slate-900" />
          </>
        )}
        {state === "training" && (
          <>
            <PunchButton kind="training_end" label="↩︎ Done with training" cls="bg-emerald-600 text-white hover:bg-emerald-700" />
            <PunchButton kind="out" label="■ End of day" cls="bg-slate-800 text-white hover:bg-slate-900" />
          </>
        )}
        {state === "bathroom" && (
          <>
            <PunchButton kind="bathroom_end" label="↩︎ Back (washed hands 🧼)" cls="bg-emerald-600 text-white hover:bg-emerald-700" />
            <PunchButton kind="out" label="■ End of day" cls="bg-slate-800 text-white hover:bg-slate-900" />
          </>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        {state === "offline"
          ? "Clock In first — then the Break, Lunch, and End of day buttons turn on. When you come back from a break, tap “End break — back to work.”"
          : "Tap Start break or Start lunch when you step away, then “back to work” when you return. Press End of day to finish."}
        {" "}Your status is saved on the server, so you can close the tab and come back — the clock keeps running until you press End of day.
      </p>
    </div>
  );
}
