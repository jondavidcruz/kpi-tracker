"use client";
// Drag KPIs into the order you want (Jon 2026-10-07: "so I don't always have
// to tell you"). Same proven HTML5 DnD rules as the sidebar board.
import { useState, useTransition } from "react";
import { saveKpiOrderAction, renameKpiAction } from "@/app/crm/actions";

export type KpiRow = { id: string; key: string; name: string; emoji: string };

export default function KpiOrderBoard({ groups: initial, canRename = false }: { groups: Array<{ role: string; label: string; kpis: KpiRow[] }>; canRename?: boolean }) {
  const [groups, setGroups] = useState(initial);
  const [drag, setDrag] = useState<{ role: string; id: string } | null>(null);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  const beginEdit = (k: KpiRow) => { setEditingId(k.id); setEditVal(k.name); };
  const commitEdit = (role: string, id: string) => {
    const name = editVal.trim();
    setEditingId(null);
    if (!name) return;
    setGroups((gs) => gs.map((g) => g.role === role ? { ...g, kpis: g.kpis.map((k) => k.id === id ? { ...k, name } : k) } : g));
    const fd = new FormData(); fd.set("kpiId", id); fd.set("name", name);
    start(async () => { await renameKpiAction(fd); setSaved(true); setTimeout(() => setSaved(false), 1500); });
  };

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
                draggable={editingId !== k.id}
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", k.id); e.dataTransfer.effectAllowed = "move"; setTimeout(() => setDrag({ role: g.role, id: k.id }), 0); }}
                onDragEnd={() => setDrag(null)}
                onDragOver={(e) => { if (drag?.role === g.role) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
                onDrop={(e) => { e.preventDefault(); dropOn(g.role, k.id); }}
                className={`group flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[13px] text-slate-700 ${editingId === k.id ? "" : "cursor-grab active:cursor-grabbing"} ${drag?.id === k.id ? "opacity-50" : ""}`}
              >
                <span className="text-slate-300">⠿</span>
                {editingId === k.id ? (
                  <input
                    autoFocus
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitEdit(g.role, k.id); } else if (e.key === "Escape") setEditingId(null); }}
                    onBlur={() => commitEdit(g.role, k.id)}
                    className="flex-1 rounded border border-emerald-300 bg-white px-1.5 py-0.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                ) : (
                  <>
                    <span className="flex-1">{k.emoji} {k.name}</span>
                    {canRename && <button type="button" onClick={() => beginEdit(k)} title="Rename this KPI" className="opacity-0 transition group-hover:opacity-100 text-[11px] text-slate-400 hover:text-emerald-600">✏️ rename</button>}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
