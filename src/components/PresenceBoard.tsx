"use client";

import { useEffect, useState } from "react";

type State = "online" | "break" | "lunch" | "offline" | "outage" | "dropped";
type Person = { id: string; name: string; state: State; outageKind?: string | null; outageMin?: number | null; sinceMs: number | null; workedMin: number };

const DOT: Record<State, string> = {
  online: "bg-emerald-500",
  break: "bg-amber-400",
  lunch: "bg-amber-400",
  offline: "bg-slate-300",
  outage: "bg-red-500",
  dropped: "bg-red-400",
};
const RING: Record<State, string> = {
  online: "ring-emerald-200 bg-emerald-50",
  break: "ring-amber-200 bg-amber-50",
  lunch: "ring-amber-200 bg-amber-50",
  offline: "ring-slate-200 bg-white",
  outage: "ring-red-300 bg-red-50",
  dropped: "ring-red-200 bg-red-50",
};
const LABEL: Record<State, string> = { online: "Online", break: "On break", lunch: "At lunch", offline: "Offline", outage: "Outage", dropped: "Disconnected" };
const ORDER: Record<State, number> = { outage: 0, dropped: 1, online: 2, break: 3, lunch: 4, offline: 5 };
const outageLabel = (kind?: string | null) => (kind === "power" ? "⚡ Power outage" : kind === "internet" ? "📶 Internet outage" : "⚠️ Outage");

function hm(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
function clockSince(ms: number | null) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function PresenceBoard({ initial }: { initial: Person[] }) {
  const [people, setPeople] = useState<Person[]>(initial);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/presence", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (alive && Array.isArray(j.people)) setPeople(j.people);
      } catch {
        /* keep last good state */
      }
    };
    const id = setInterval(load, 20000);
    load();
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const sorted = [...people].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name));
  const online = people.filter((p) => p.state === "online").length;

  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Online</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Break / Lunch</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Offline</span>
        <span className="ml-auto font-semibold text-emerald-600">{online} online now</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {sorted.map((p) => (
          <div key={p.id} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 ring-1 ${RING[p.state]}`}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[p.state]} ${p.state !== "offline" ? "animate-pulse" : ""}`} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-800">{p.name}</div>
              <div className={`truncate text-[11px] ${p.state === "outage" || p.state === "dropped" ? "font-semibold text-red-600" : "text-slate-500"}`}>
                {p.state === "outage" ? outageLabel(p.outageKind) : LABEL[p.state]}
                {p.state === "outage" && p.outageMin ? ` · ${hm(p.outageMin)} out` : ""}
                {(p.state === "online" || p.state === "break" || p.state === "lunch") && p.sinceMs ? ` · since ${clockSince(p.sinceMs)}` : ""}
                {p.workedMin > 0 ? ` · ${hm(p.workedMin)} today` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
