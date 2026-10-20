"use client";
// 🔔 Due-soon reminders (Jon 2026-10-20: "no reason anyone misses a task or
// appointment — pop it on their screen and keep nagging, multiple times a day").
// App-wide: polls the current user's upcoming appointments + today's tasks and fires
// an escalating pop-up as each one's time approaches. Appt = red, task = green.
// Snooze is short (it comes right back), and an urgent item beeps when it lands — so
// it's deliberately hard to ignore. Marking a task done or snoozing is one tap.
import { useEffect, useRef, useState } from "react";

type Appt = { id: string; title: string; atIso: string; oppId: string; lead: string };
type Task = { id: string; title: string; due: string; time: string; oppId: string; lead: string };
type Item = { key: string; kind: "appt" | "task"; id: string; title: string; lead: string; oppId: string; ms: number | null; timed: boolean };

const WINDOW_MIN = 60;      // start reminding this many minutes before
const PAST_GRACE_MIN = 25;  // keep nagging this long after the time passes

export default function DueReminders() {
  const [data, setData] = useState<{ appts: Appt[]; tasks: Task[] } | null>(null);
  const [, setTick] = useState(0);
  const [snoozeBump, setSnoozeBump] = useState(0); // force recompute after a snooze
  const alerted = useRef<Set<string>>(new Set());

  // Poll the feed; refresh the local clock every 20s so items activate on time.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try { const r = await fetch("/api/crm/reminders", { cache: "no-store" }); if (r.ok && alive) setData(await r.json()); } catch { /* retry next tick */ }
    };
    load();
    const poll = setInterval(load, 90_000);
    const clock = setInterval(() => setTick((t) => t + 1), 20_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { alive = false; clearInterval(poll); clearInterval(clock); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, []);

  const now = Date.now();
  const snoozedUntil = (id: string): number => { try { return Number(localStorage.getItem(`fo_rem_snz_${id}`) || 0); } catch { return 0; } };
  const snooze = (id: string, mins: number) => { try { localStorage.setItem(`fo_rem_snz_${id}`, String(Date.now() + mins * 60000)); } catch { /* ok */ } setSnoozeBump((n) => n + 1); };
  // Global close — Jon 2026-10-20: "don't force me to take action, let me close it."
  // Hides the whole popup for a while; timed items still come back as their time nears.
  const hiddenUntil = (): number => { try { return Number(localStorage.getItem("fo_rem_hide_until") || 0); } catch { return 0; } };
  const closeAll = () => { try { localStorage.setItem("fo_rem_hide_until", String(Date.now() + 45 * 60000)); } catch { /* ok */ } setSnoozeBump((n) => n + 1); };

  // Only TIMED items nag here — appointments and tasks that have a time. Plain
  // "due today" tasks (no time) are NOT forced into this popup (they'd flood it);
  // they live in the once-a-day start/end popup, the Tasks page, and the green card.
  const all: Item[] = [
    ...(data?.appts ?? []).map((a): Item => ({ key: `a_${a.id}`, kind: "appt", id: a.id, title: a.title, lead: a.lead, oppId: a.oppId, ms: Date.parse(a.atIso), timed: true })),
    ...(data?.tasks ?? []).filter((t) => t.time).map((t): Item => ({ key: `t_${t.id}`, kind: "task", id: t.id, title: t.title, lead: t.lead, oppId: t.oppId, ms: Date.parse(`${t.due}T${t.time}:00`), timed: true })),
  ];

  // Which are "active" right now (within the window, not snoozed, not globally hidden)?
  const active = hiddenUntil() > now ? [] : all.filter((it) => {
    if (snoozedUntil(it.id) > now) return false;
    if (it.ms == null) return false;
    const mins = (it.ms - now) / 60000;
    return mins <= WINDOW_MIN && mins >= -PAST_GRACE_MIN;
  });

  const isUrgent = (it: Item) => it.timed && it.ms != null && (it.ms - now) / 60000 <= 15;

  // 🔊 Beep when a NEW urgent item lands (and re-beep when one un-snoozes while still
  // urgent). Dedupe via a ref so it doesn't drone on every 20s tick.
  useEffect(() => {
    const urgentNow = new Set(active.filter(isUrgent).map((it) => it.key));
    let fresh = false;
    urgentNow.forEach((k) => { if (!alerted.current.has(k)) fresh = true; });
    alerted.current = urgentNow;
    if (fresh) beep();
  });

  if (active.length === 0) return null;

  const rel = (it: Item): string => {
    if (!it.timed || it.ms == null) return "due today";
    const mins = Math.round((it.ms - now) / 60000);
    if (mins <= 0) return mins >= -1 ? "now" : `${-mins} min ago`;
    if (mins < 60) return `in ${mins} min`;
    return `in ${Math.round(mins / 60)}h`;
  };

  const anyUrgent = active.some(isUrgent);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[95] flex justify-center px-4">
      <div className={`pointer-events-auto w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl ring-2 ${anyUrgent ? "animate-pulse ring-red-400" : "ring-slate-200"}`}>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-base">🔔</span>
          <span className="text-sm font-extrabold text-slate-900">Coming up — don&apos;t miss it</span>
          <span className="ml-auto text-[10px] font-bold text-slate-400">{active.length} to do</span>
          <button onClick={closeAll} title="Hide for a while" className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-200">✕</button>
        </div>
        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {active.sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity)).map((it) => {
            const red = it.kind === "appt";
            const urg = isUrgent(it);
            return (
              <div key={it.key} className={`rounded-xl px-3 py-2 ring-1 ${red ? "bg-red-50 ring-red-200" : "bg-emerald-50 ring-emerald-200"} ${urg ? "ring-2" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="text-base">{red ? "📅" : "✅"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-slate-800">{it.title}</div>
                    <div className="text-[10.5px] font-semibold text-slate-500">
                      {red ? "Appointment" : "Task"}{it.lead ? ` · ${it.lead}` : ""} · <span className={urg ? "font-extrabold text-red-600" : "text-slate-500"}>{rel(it)}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <a href={it.oppId ? `/crm/${it.oppId}` : "/crm/tasks"} className="rounded-lg bg-brand-navy px-2.5 py-1 text-[11px] font-bold text-white hover:bg-brand-navy-700">Open →</a>
                  {it.kind === "task" && (
                    <button onClick={async () => { try { await fetch("/api/crm/task-done", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id }) }); } catch { /* ok */ } snooze(it.id, 24 * 60); }} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700">✓ Done</button>
                  )}
                  <button onClick={() => snooze(it.id, urg ? 5 : 15)} className="ml-auto rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50">Snooze {urg ? "5" : "15"}m</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// A short two-tone chime via Web Audio — no asset, respects a blocked AudioContext.
function beep() {
  try {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new AC();
    const tones = [880, 1180];
    tones.forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      const t0 = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      o.start(t0); o.stop(t0 + 0.18);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch { /* audio blocked — the visual pulse still fires */ }
}
