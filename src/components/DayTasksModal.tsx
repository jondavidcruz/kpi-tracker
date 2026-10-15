"use client";
// ☀️🌙 Start-of-day / end-of-day task popups (Jon 2026-10-15).
// • On the first page load of the day, pop up the tasks due today so everyone
//   starts the day knowing what's on their plate.
// • At the end of the shift (each person's real shift end — Nick & Kyle finish at
//   12:00 PM), pop up again to make sure the day's tasks actually got done.
// Each popup dismisses once per day (localStorage). Leadership (Jon/Enrico/
// Viktoriia/Marie) also see the shared 🏛 Leadership queue in both popups.
import { useCallback, useEffect, useRef, useState } from "react";

type Task = { id: string; title: string; due: string };
type Data = { who: string; isLead: boolean; tasks: Task[]; leadershipTasks: Task[]; shiftEndIso: string | null; shiftEndLabel: string | null };
type Mode = "sod" | "eod" | null;

const todayKey = () => new Date().toISOString().slice(0, 10);
const seen = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return true; } };
const markSeen = (k: string) => { try { localStorage.setItem(k, "1"); } catch {} };

export default function DayTasksModal() {
  const [data, setData] = useState<Data | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [mine, setMine] = useState<Task[]>([]);
  const [lead, setLead] = useState<Task[]>([]);
  const firedEod = useRef(false);

  const load = useCallback(async (): Promise<Data | null> => {
    try {
      const r = await fetch("/api/crm/mytasks", { cache: "no-store" });
      if (!r.ok) return null;
      const d = (await r.json()) as Data;
      setData(d); setMine(d.tasks ?? []); setLead(d.leadershipTasks ?? []);
      return d;
    } catch { return null; }
  }, []);

  // Start of day: first load, show what's due.
  useEffect(() => {
    let alive = true;
    (async () => {
      const d = await load();
      if (!alive || !d) return;
      const sodKey = `fo_sod_${todayKey()}`;
      const count = (d.tasks?.length ?? 0) + (d.isLead ? d.leadershipTasks?.length ?? 0 : 0);
      if (!seen(sodKey) && count > 0) setMode("sod");
    })();
    return () => { alive = false; };
  }, [load]);

  // End of day: when the clock passes the shift end, re-check and nudge.
  useEffect(() => {
    if (!data?.shiftEndIso) return;
    const endMs = Date.parse(data.shiftEndIso);
    if (isNaN(endMs)) return;
    const check = async () => {
      const eodKey = `fo_eod_${todayKey()}`;
      if (firedEod.current || seen(eodKey)) return;
      if (Date.now() < endMs) return;
      firedEod.current = true;
      const fresh = await load();
      const count = (fresh?.tasks?.length ?? 0) + (fresh?.isLead ? fresh?.leadershipTasks?.length ?? 0 : 0);
      if (count > 0) setMode("eod"); else markSeen(eodKey);
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [data?.shiftEndIso, load]);

  const complete = async (id: string) => {
    setMine((xs) => xs.filter((t) => t.id !== id));
    setLead((xs) => xs.filter((t) => t.id !== id));
    try { await fetch("/api/crm/task-done", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); } catch {}
  };

  const close = () => {
    markSeen(mode === "eod" ? `fo_eod_${todayKey()}` : `fo_sod_${todayKey()}`);
    setMode(null);
  };

  if (!mode || !data) return null;
  const showLead = data.isLead && lead.length > 0;
  const total = mine.length + (data.isLead ? lead.length : 0);
  const isEod = mode === "eod";

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 p-4 pt-16 backdrop-blur-sm" onClick={close}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10" onClick={(e) => e.stopPropagation()}>
        <div className={`px-5 py-4 text-white ${isEod ? "bg-gradient-to-br from-indigo-900 to-slate-900" : "bg-gradient-to-br from-brand-navy to-slate-800"}`}>
          <div className="text-lg font-extrabold">{isEod ? `🌙 Wrapping up, ${data.who}?` : `☀️ Good morning, ${data.who}`}</div>
          <div className="mt-0.5 text-[12px] text-white/70">
            {isEod
              ? `Your shift ends ${data.shiftEndLabel ?? "now"} — ${total} task${total === 1 ? "" : "s"} still open. Knock them out before you log off.`
              : `You have ${total} task${total === 1 ? "" : "s"} due today. Here's the plan.`}
          </div>
        </div>
        <div className="max-h-[50vh] overflow-auto p-3">
          {total === 0 ? (
            <div className="py-6 text-center text-sm font-semibold text-emerald-600">✅ All clear — nothing left. Nice work!</div>
          ) : (
            <ul className="space-y-1.5">
              {showLead && <li className="px-1 pt-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-600">🏛 Leadership (shared)</li>}
              {data.isLead && lead.map((t) => <Row key={t.id} t={t} onDone={complete} accent="amber" />)}
              {showLead && mine.length > 0 && <li className="px-1 pt-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Yours</li>}
              {mine.map((t) => <Row key={t.id} t={t} onDone={complete} accent="navy" />)}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
          <a href="/crm/tasks?v=today" className="text-[12px] font-bold text-indigo-600 hover:underline">Open full task list →</a>
          <button onClick={close} className={`rounded-lg px-4 py-2 text-xs font-bold text-white ${isEod ? "bg-indigo-700 hover:bg-indigo-800" : "bg-brand-navy hover:opacity-90"}`}>
            {isEod ? (total === 0 ? "Done for the day" : "Log off anyway") : "Got it — let's go"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ t, onDone, accent }: { t: Task; onDone: (id: string) => void; accent: "amber" | "navy" }) {
  const overdue = t.due && t.due.slice(0, 10) < todayKey();
  return (
    <li className={`flex items-start gap-2 rounded-lg p-2 ring-1 ${accent === "amber" ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-200"}`}>
      <button onClick={() => onDone(t.id)} title="Mark done" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-slate-300 bg-white text-[10px] text-transparent hover:border-emerald-500 hover:text-emerald-600">✓</button>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold leading-snug text-slate-800">{t.title}</div>
        {t.due && <div className={`text-[10px] font-bold ${overdue ? "text-red-600" : "text-slate-400"}`}>{overdue ? "⚠ overdue · " : ""}due {t.due.slice(0, 10)}</div>}
      </div>
    </li>
  );
}
