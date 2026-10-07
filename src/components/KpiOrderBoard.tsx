"use client";
// Drag KPIs into the order you want (Jon 2026-10-07: "so I don't always have
// to tell you"). Same proven HTML5 DnD rules as the sidebar board.
import { useState, useTransition } from "react";
import { saveKpiOrderAction } from "@/app/crm/actions";

export type KpiRow = { id: string; key: string; name: string; emoji: string };

export default function KpiOrderBoard({ groups: initial }: { groups: Array<{ role: string; label: string; kpis: KpiRow[] }> }) {
  const [groups, setGroups] = useState(initial);
  const [drag, setDrag] = useState<{ role: string; id: string } | null>(null);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const dropOn = (role: string, targetId: string) => {
    if (!drag || drag.role !== role || drag.id === targetId) return;
    const next = groups.map((g) => {
      if (g.role !== role) return g;
      const list = [...g.kpis];
      const from = list.findIndex((k) => k.id === drag.id);
      const to = list.findIndex((k) => k.id === targetId);
      const [m] = list.splice(from, 1);
      list.splice(to, 0, m);
      return { ...g, kpis: list };
    });
    setGroups(next);
    const fd = new FormData();
    fd.set("role", role);
    fd.set("order", JSON.stringify(next.find((g) => g.role === role)!.kpis.map((k) => k.id)));
    start(async () => { await saveKpiOrderAction(fd); setSaved(true); setTimeout(() => setSaved(false), 1500); });
  };

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {groups.map((g) => (
        <div key={g.role} className="rounded-2xl bg-white p-3.5 ring-1 ring-slate-200">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-700">{g.label}</span>
            {pending ? <span className="text-[10px] font-bold text-amber-600">saving…</span> : saved ? <span className="text-[10px] font-bold text-emerald-600">✓ saved</span> : null}
          </div>
          <div className="space-y-0.5">
            {g.kpis.map((k) => (
              <div
                key={k.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", k.id); e.dataTransfer.effectAllowed = "move"; setTimeout(() => setDrag({ role: g.role, id: k.id }), 0); }}
                onDragEnd={() => setDrag(null)}
                onDragOver={(e) => { if (drag?.role === g.role) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
                onDrop={(e) => { e.preventDefault(); dropOn(g.role, k.id); }}
                className={`flex cursor-grab items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[13px] text-slate-700 active:cursor-grabbing ${drag?.id === k.id ? "opacity-50" : ""}`}
              >
                <span className="text-slate-300">⠿</span>
                <span>{k.emoji} {k.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
