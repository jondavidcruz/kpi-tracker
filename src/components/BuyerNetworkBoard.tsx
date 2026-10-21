"use client";
// 🏗/🧑‍💼 Buyer-Network CRM (Jon 2026-10-20) — the dispo team's own CRM for
// developers + buyer agents, SEPARATE from the seller CRM. Two views:
//  • Directory (default) — filter by area / price / stage; the "a deal landed,
//    who buys here?" view.
//  • Board — a stage Kanban you can drag cards across.
// Cards open the full lead (/crm/[id]) which shows custom developer/agent fields
// (never seller questions). Leads here get attached to deals from the deal card.
import { useState, useMemo } from "react";
import Link from "next/link";
import { setOppStageAction } from "@/app/crm/actions";

export type NetworkLead = {
  id: string; name: string; phone?: string; email?: string;
  area?: string; buyBox?: string; priceBand?: string; stage: string; updatedAt?: string; noteCount?: number;
};
type Stage = { key: string; label: string; cls?: string };

export default function BuyerNetworkBoard({ leads, stages, kindLabel }: { leads: NetworkLead[]; stages: Stage[]; kindLabel: string }) {
  const [view, setView] = useState<"directory" | "board">("directory");
  const [q, setQ] = useState("");
  const [stageF, setStageF] = useState("");
  const stageLabel = (k: string) => stages.find((s) => s.key === k)?.label ?? k;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads.filter((l) =>
      (!stageF || l.stage === stageF) &&
      (!needle || `${l.name} ${l.area ?? ""} ${l.buyBox ?? ""} ${l.priceBand ?? ""} ${l.phone ?? ""}`.toLowerCase().includes(needle))
    );
  }, [leads, q, stageF]);

  return (
    <div className="space-y-3">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-200">
          <button onClick={() => setView("directory")} className={`px-3 py-1.5 text-xs font-bold ${view === "directory" ? "bg-brand-navy text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📇 Directory</button>
          <button onClick={() => setView("board")} className={`px-3 py-1.5 text-xs font-bold ${view === "board" ? "bg-brand-navy text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📊 Board</button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`🔎 Search ${kindLabel} — name, area, buy-box, price…`} className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
        {view === "directory" && (
          <select value={stageF} onChange={(e) => setStageF(e.target.value)} className="rounded-xl border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
            <option value="">All stages</option>
            {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        )}
        <span className="text-[11px] font-semibold text-slate-400">{filtered.length} of {leads.length}</span>
      </div>

      {view === "directory" ? (
        <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
          {filtered.length === 0 && <div className="bg-white p-6 text-center text-sm text-slate-400">No {kindLabel} match.</div>}
          {filtered.map((l, i) => (
            <Link key={l.id} href={`/crm/${l.id}`} className={`flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50 ${i ? "border-t border-slate-100" : ""} ${i % 2 ? "bg-white" : "bg-slate-50/40"}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[13px] font-bold text-slate-800">{l.name}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{stageLabel(l.stage)}</span>
                  {l.noteCount ? <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">📝 {l.noteCount}</span> : null}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                  {l.phone && <span className="font-semibold text-brand-navy">{l.phone}</span>}
                  {l.area && <span>📍 {l.area}</span>}
                  {l.priceBand && <span className="font-semibold text-emerald-700">💵 {l.priceBand}</span>}
                </div>
                {l.buyBox && <div className="mt-0.5 truncate text-[11px] text-slate-400">{l.buyBox}</div>}
              </div>
              <span className="mt-1 shrink-0 text-[11px] font-bold text-sky-600">Open →</span>
            </Link>
          ))}
        </div>
      ) : (
        <BoardView leads={filtered} stages={stages} stageLabel={stageLabel} />
      )}
    </div>
  );
}

function BoardView({ leads: initial, stages, stageLabel }: { leads: NetworkLead[]; stages: Stage[]; stageLabel: (k: string) => string }) {
  const [leads, setLeads] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const drop = (stage: string) => {
    const lead = leads.find((l) => l.id === dragId);
    if (!lead || lead.stage === stage) return;
    setLeads(leads.map((l) => (l.id === dragId ? { ...l, stage } : l)));
    const fd = new FormData(); fd.set("id", lead.id); fd.set("stage", stage);
    setOppStageAction(fd);
  };
  return (
    <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
      {stages.map((col) => {
        const inCol = leads.filter((l) => l.stage === col.key);
        return (
          <div key={col.key}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); setOver(col.key); } }}
            onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
            onDrop={(e) => { e.preventDefault(); drop(col.key); setOver(null); }}
            className={`min-w-[190px] flex-1 rounded-2xl bg-slate-100/70 p-2 ring-1 transition ${over === col.key && dragId ? "ring-2 ring-indigo-400 bg-indigo-50/60" : "ring-slate-200/60"}`}>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">{stageLabel(col.key)}</span>
              <span className="text-xs font-extrabold tabular-nums text-slate-500">{inCol.length}</span>
            </div>
            <div className="space-y-1.5">
              {inCol.map((l) => (
                <div key={l.id} draggable
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", l.id); setTimeout(() => setDragId(l.id), 0); }}
                  onDragEnd={() => { setDragId(null); setOver(null); }}
                  className={`rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300 active:cursor-grabbing ${dragId === l.id ? "opacity-50" : ""}`}>
                  <Link href={`/crm/${l.id}`} onClick={(e) => e.stopPropagation()} className="block truncate text-[12px] font-bold text-slate-800 hover:text-indigo-600 hover:underline">{l.name}</Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500">
                    {l.phone && <span className="font-semibold text-brand-navy">{l.phone}</span>}
                    {l.area && <span>📍 {l.area}</span>}
                  </div>
                  {l.priceBand && <div className="mt-0.5 text-[10px] font-bold text-emerald-700">💵 {l.priceBand}</div>}
                </div>
              ))}
              {inCol.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 px-2 py-3 text-center text-[10px] text-slate-300">empty</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
