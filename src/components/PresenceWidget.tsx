"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type State = "online" | "break" | "lunch" | "meeting" | "offline" | "outage" | "dropped";
type Person = { id: string; name: string; state: State; sinceMs: number | null; workedMin: number; outageMin?: number | null; outageKind?: string | null };

const DOT: Record<State, string> = {
  online: "bg-emerald-500", break: "bg-amber-400", lunch: "bg-amber-400", meeting: "bg-violet-500",
  offline: "bg-slate-300", outage: "bg-red-500", dropped: "bg-red-400",
};
const LABEL: Record<State, string> = { online: "Online", break: "Break", lunch: "Lunch", meeting: "In a meeting", offline: "Offline", outage: "Outage", dropped: "Disconnected" };
const ORDER: Record<State, number> = { outage: 0, dropped: 1, online: 2, meeting: 3, break: 4, lunch: 5, offline: 6 };
const outageKindLabel = (k?: string | null) => (k === "power" ? "⚡ power" : k === "internet" ? "📶 internet" : "");
function hm(min: number) { const h = Math.floor(min / 60), m = min % 60; return h ? `${h}h ${m}m` : `${m}m`; }

// Always-on, DRAGGABLE, minimizable team-presence window. Shows who's online, how long
// they've been logged in, and how long anyone's been on a power/internet outage.
export default function PresenceWidget() {
  const [people, setPeople] = useState<Person[]>([]);
  const [open, setOpen] = useState(true);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const dragOff = useRef<{ dx: number; dy: number } | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    try { const o = localStorage.getItem("presenceWidgetOpen"); if (o !== null) setOpen(o === "1"); } catch { /* ignore */ }
    try { const p = localStorage.getItem("presenceWidgetPos"); if (p) { const v = JSON.parse(p); setPos(v); posRef.current = v; } } catch { /* ignore */ }
    setReady(true);
  }, []);
  const toggle = () => setOpen((o) => { const n = !o; try { localStorage.setItem("presenceWidgetOpen", n ? "1" : "0"); } catch { /* ignore */ } return n; });

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
    const id = setInterval(load, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const onMove = useCallback((e: PointerEvent) => {
    if (!dragOff.current) return;
    moved.current = true;
    const x = Math.min(Math.max(8, e.clientX - dragOff.current.dx), window.innerWidth - 60);
    const y = Math.min(Math.max(8, e.clientY - dragOff.current.dy), window.innerHeight - 30);
    const v = { x, y }; posRef.current = v; setPos(v);
  }, []);
  const onUp = useCallback(() => {
    dragOff.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    try { if (posRef.current) localStorage.setItem("presenceWidgetPos", JSON.stringify(posRef.current)); } catch { /* ignore */ }
  }, [onMove]);
  const onDown = useCallback((e: React.PointerEvent) => {
    const root = (e.currentTarget as HTMLElement).closest("[data-presence-root]") as HTMLElement | null;
    const rect = (root ?? (e.currentTarget as HTMLElement)).getBoundingClientRect();
    dragOff.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    moved.current = false;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [onMove, onUp]);

  if (!ready) return null;
  const sorted = [...people].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name));
  const online = people.filter((p) => p.state === "online").length;
  const alerts = people.filter((p) => p.state === "outage" || p.state === "dropped").length;
  const rootStyle = pos ? { left: pos.x, top: pos.y } : undefined;
  const rootPosCls = pos ? "" : "bottom-4 left-4";

  return (
    <div data-presence-root style={rootStyle} className={`fixed z-40 ${rootPosCls}`}>
      {open ? (
        <div className="w-64 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200">
          <div onPointerDown={onDown} title="Drag to move" className="flex cursor-move touch-none select-none items-center justify-between border-b border-slate-100 bg-slate-50/70 px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              👥 Team <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] text-emerald-700">{online} online</span>
              {alerts > 0 && <span className="rounded-full bg-red-100 px-1.5 text-[10px] text-red-700">{alerts} ⚠️</span>}
            </span>
            <button onPointerDown={(e) => e.stopPropagation()} onClick={toggle} title="Minimize" className="grid h-5 w-5 place-items-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700">–</button>
          </div>
          <div className="max-h-72 space-y-0.5 overflow-y-auto p-1.5">
            {sorted.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-slate-400">Loading…</div>
            ) : sorted.map((p) => {
              const outish = p.state === "outage" || p.state === "dropped";
              const dur = p.state === "outage" ? (p.outageMin ? `${hm(p.outageMin)} out` : "") : (p.workedMin ? hm(p.workedMin) : "");
              return (
                <div key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[p.state]} ${outish ? "animate-pulse" : ""}`} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{p.name.split(" ")[0]}</span>
                  <span className="shrink-0 text-right">
                    <span className={`block text-[11px] ${outish ? "font-semibold text-red-600" : "text-slate-400"}`}>{LABEL[p.state]}{p.state === "outage" && outageKindLabel(p.outageKind) ? ` ${outageKindLabel(p.outageKind)}` : ""}</span>
                    {dur && <span className="block text-[10px] text-slate-400">{dur}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <button
          onPointerDown={onDown}
          onClick={() => { if (!moved.current) toggle(); }}
          title="Drag to move · click to open"
          className="flex cursor-move touch-none items-center gap-2 rounded-full bg-brand-navy px-3 py-2 text-sm font-semibold text-white shadow-lg ring-1 ring-black/10 hover:bg-brand-navy-700">
          <span className={`h-2.5 w-2.5 rounded-full ${alerts ? "bg-red-400 animate-pulse" : "bg-emerald-400"}`} />
          👥 {online} online
        </button>
      )}
    </div>
  );
}
