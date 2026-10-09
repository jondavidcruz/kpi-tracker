"use client";
// 📊 The all-day scoreboard pill (Jon 2026-10-09): dials + connects vs goal,
// always visible bottom-left, refreshes itself. One glance — never a page.
import { useEffect, useState } from "react";

type Stats = { dials: number; connects: number; goalDials: number; goalConnects: number };

export default function MyDayPill() {
  const [s, setS] = useState<Stats | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem("fo_daypill_hide") === "1") setHidden(true); } catch { /* show */ }
    const load = () => fetch("/api/crm/mystats", { cache: "no-store" }).then(async (r) => { if (r.ok) setS((await r.json()) as Stats); }).catch(() => {});
    load();
    const t = setInterval(load, 180_000);
    return () => clearInterval(t);
  }, []);
  const toggle = () => { setHidden((h) => { try { localStorage.setItem("fo_daypill_hide", h ? "0" : "1"); } catch { /* fine */ } return !h; }); };
  if (!s) return null;
  if (hidden) return <button onClick={toggle} title="Show my day" className="fixed bottom-3 left-3 z-40 grid h-7 w-7 place-items-center rounded-full bg-white text-[11px] shadow ring-1 ring-slate-200 hover:bg-slate-50">📊</button>;
  const tone = (v: number, g: number) => (g <= 0 ? "text-slate-700" : v >= g ? "text-emerald-600" : v >= g * 0.6 ? "text-amber-600" : "text-red-500");
  return (
    <span className="fixed bottom-3 left-3 z-40 flex items-center gap-2.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold shadow-lg ring-1 ring-slate-200">
      <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">My day</span>
      <span className={tone(s.dials, s.goalDials)}>📞 {s.dials}{s.goalDials > 0 ? `/${s.goalDials}` : ""} dials</span>
      <span className={tone(s.connects, s.goalConnects)}>✅ {s.connects}{s.goalConnects > 0 ? `/${s.goalConnects}` : ""} connects</span>
      <button onClick={toggle} title="Hide" className="text-slate-300 hover:text-slate-500">✕</button>
    </span>
  );
}
