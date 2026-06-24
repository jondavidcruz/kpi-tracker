"use client";

import { useEffect, useState } from "react";

type State = "online" | "break" | "lunch" | "offline" | "outage" | "dropped";
type Person = { id: string; name: string; state: State; sinceMs: number | null; workedMin: number; outageKind?: string | null };

const DOT: Record<State, string> = {
  online: "bg-emerald-500", break: "bg-amber-400", lunch: "bg-amber-400",
  offline: "bg-slate-300", outage: "bg-red-500", dropped: "bg-red-400",
};
const LABEL: Record<State, string> = { online: "Online", break: "Break", lunch: "Lunch", offline: "Offline", outage: "Outage", dropped: "Disconnected" };
const ORDER: Record<State, number> = { outage: 0, dropped: 1, online: 2, break: 3, lunch: 4, offline: 5 };

// Always-on, minimizable team-presence window — floats on every page so you can see
// who's online without leaving what you're doing. Reuses the /api/presence feed.
export default function PresenceWidget() {
  const [people, setPeople] = useState<Person[]>([]);
  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { const v = localStorage.getItem("presenceWidgetOpen"); if (v !== null) setOpen(v === "1"); } catch { /* ignore */ }
    setReady(true);
  }, []);
  const toggle = () => setOpen((o) => { try { localStorage.setItem("presenceWidgetOpen", o ? "0" : "1"); } catch { /* ignore */ } return !o; });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/presence", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (alive && Array.isArray(j.people)) setPeople(j.people);
      } catch { /* keep last good state */ }
    };
    load();
    const id = setInterval(load, 25000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!ready) return null;
  const sorted = [...people].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name));
  const online = people.filter((p) => p.state === "online").length;
  const alerts = people.filter((p) => p.state === "outage" || p.state === "dropped").length;

  if (!open) {
    return (
      <button onClick={toggle} title="Show team presence"
        className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full bg-brand-navy px-3 py-2 text-sm font-semibold text-white shadow-lg ring-1 ring-black/10 hover:bg-brand-navy-700">
        <span className={`h-2.5 w-2.5 rounded-full ${alerts ? "bg-red-400 animate-pulse" : "bg-emerald-400"}`} />
        👥 {online} online
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-40 w-64 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          👥 Team <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] text-emerald-700">{online} online</span>
          {alerts > 0 && <span className="rounded-full bg-red-100 px-1.5 text-[10px] text-red-700">{alerts} ⚠️</span>}
        </span>
        <button onClick={toggle} title="Minimize" className="grid h-5 w-5 place-items-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700">–</button>
      </div>
      <div className="max-h-72 space-y-0.5 overflow-y-auto p-1.5">
        {sorted.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-slate-400">Loading…</div>
        ) : sorted.map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[p.state]} ${(p.state === "outage" || p.state === "dropped") ? "animate-pulse" : ""}`} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{p.name.split(" ")[0]}</span>
            <span className="shrink-0 text-[11px] text-slate-400">{LABEL[p.state]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
