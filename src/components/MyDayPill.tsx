"use client";
// 📊 The all-day scoreboard pill (Jon 2026-10-09): dials + connects vs goal,
// always visible bottom-left, refreshes itself. One glance — never a page.
import { useEffect, useState } from "react";

type Lever = { label: string; value: number };
type Dept = { key: string; label: string; levers: Lever[] };
type Stats = { who?: string; position?: string; dials: number; connects: number; talkSecs?: number; goalDials: number; goalConnects: number; depts?: Dept[] };

export default function MyDayPill() {
  const [s, setS] = useState<Stats | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem("fo_daypill_hide") === "1") setHidden(true); } catch { /* show */ }
    const load = () => { if (document.hidden) return; fetch("/api/crm/mystats", { cache: "no-store" }).then(async (r) => { if (r.ok) setS((await r.json()) as Stats); }).catch(() => {}); };
    load();
    const t = setInterval(load, 180_000); // paused while the tab is hidden (Jon 2026-11-04 cost cut)
    return () => clearInterval(t);
  }, []);
  const toggle = () => { setHidden((h) => { try { localStorage.setItem("fo_daypill_hide", h ? "0" : "1"); } catch { /* fine */ } return !h; }); };
  if (!s) return null;
  if (hidden) return <button onClick={toggle} title="Show my day" className="fixed right-28 top-4 z-40 grid h-7 w-7 place-items-center rounded-full bg-white text-[11px] shadow ring-1 ring-slate-200 hover:bg-slate-50">📊</button>;
  const tone = (v: number, g: number) => (g <= 0 ? "text-slate-700" : v >= g ? "text-emerald-600" : v >= g * 0.6 ? "text-amber-600" : "text-red-500");
  const deptRow = (label: string, color: string, levers: Lever[]) => (
    <div className="flex items-center gap-2">
      <span className={`w-11 shrink-0 text-right font-extrabold uppercase tracking-wide ${color}`}>{label}</span>
      {levers.length === 0 ? <span className="text-slate-300">—</span> : levers.map((l) => (
        <span key={l.label} className={l.value > 0 ? "text-slate-700" : "text-slate-300"}>{l.value} {l.label}</span>
      ))}
    </div>
  );
  return (
    <div className="fixed right-28 top-4 z-40 flex flex-col gap-1 rounded-2xl bg-white px-3 py-1.5 text-[11px] font-extrabold shadow-lg ring-1 ring-slate-200">
      <div className="flex items-center gap-2.5">
      <span title={`${s?.who ?? "your"} numbers only — everyone sees their own`} className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{s.who ? `${s.who}\u2019s day` : "My day"}</span>
      <span className={tone(s.dials, s.goalDials)}>📞 {s.dials}{s.goalDials > 0 ? `/${s.goalDials}` : ""} dials</span>
      <span className={tone(s.connects, s.goalConnects)}>✅ {s.connects}{s.goalConnects > 0 ? `/${s.goalConnects}` : ""} connects</span>
      <span className="text-slate-600" title="Total talk time today">⏱ {Math.floor((s.talkSecs ?? 0) / 60)}m talk</span>
      <button onClick={toggle} title="Hide" className="text-slate-300 hover:text-slate-500">✕</button>
      </div>
      {(s.depts?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-slate-100 pt-1 text-[10px]" title="Team money levers today">
          {s.depts!.map((d) => deptRow(d.label, d.key === "acquisitions" ? "text-cyan-600" : "text-violet-600", d.levers))}
        </div>
      )}
    </div>
  );
}
