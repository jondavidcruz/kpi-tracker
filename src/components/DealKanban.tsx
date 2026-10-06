"use client";
// Kanban deals board (Jon 2026-10-06: "make the deals stage Kanban style,
// like a small CRM but not overkill"). Columns = pipeline stages, cards are
// compact; drag a card to a column to move the deal, click it to jump to the
// full deal card below. Same HTML5 DnD rules as NavOrderBoard: set a
// dataTransfer payload (Safari/Firefox cancel empty drags) and defer React
// state past dragstart (Chrome aborts on synchronous re-render).
import { useState, useTransition } from "react";
import { setDealStatusAction } from "@/app/actions";

export type KanbanDeal = {
  id: string;
  address: string;
  status: string;
  assignedTo: string;
  buyerName: string;
  money: string; // pre-formatted "$450k asking" style line
  topOffer: string; // pre-formatted best offer, "" if none
  agingLabel: string; // "12d on market", "" if unknown
  agingLevel: "fresh" | "watch" | "reduce" | "stale";
};

export type KanbanColumn = { key: string; label: string; cls: string };

const AGING_CLS: Record<string, string> = {
  fresh: "text-slate-400",
  watch: "text-amber-600",
  reduce: "text-orange-600",
  stale: "text-red-600",
};

export default function DealKanban({ columns, deals: initial, canMove }: { columns: KanbanColumn[]; deals: KanbanDeal[]; canMove: boolean }) {
  const [deals, setDeals] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const drop = (status: string) => {
    const deal = deals.find((d) => d.id === dragId);
    if (!deal || deal.status === status) return;
    setDeals(deals.map((d) => (d.id === deal.id ? { ...d, status } : d)));
    const fd = new FormData();
    fd.set("id", deal.id);
    fd.set("status", status);
    start(async () => {
      await setDealStatusAction(fd);
    });
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-[11px] text-slate-400">
        {canMove ? <span>✋ Drag a deal between stages — it saves instantly. Click a card to jump to its full details below.</span> : <span>Click a card to jump to its full details below.</span>}
        {pending && <span className="font-bold text-amber-600">saving…</span>}
      </div>
      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
        {columns.map((c) => {
          const col = deals.filter((d) => d.status === c.key);
          return (
            <div
              key={c.key}
              onDragOver={(e) => {
                if (dragId && canMove) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOverCol(c.key);
                }
              }}
              onDragLeave={() => setOverCol((o) => (o === c.key ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                drop(c.key);
                setOverCol(null);
              }}
              className={`min-w-[185px] flex-1 rounded-2xl bg-slate-100/70 p-2 ring-1 transition ${overCol === c.key && dragId ? "ring-2 ring-indigo-400 bg-indigo-50/60" : "ring-slate-200/60"}`}
            >
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.cls}`}>{c.label}</span>
                <span className="text-xs font-extrabold tabular-nums text-slate-500">{col.length}</span>
              </div>
              <div className="space-y-1.5">
                {col.map((d) => (
                  <div
                    key={d.id}
                    draggable={canMove}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", d.id);
                      e.dataTransfer.effectAllowed = "move";
                      setTimeout(() => setDragId(d.id), 0);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCol(null);
                    }}
                    onClick={() => document.getElementById(`deal-${d.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className={`cursor-pointer rounded-xl bg-white p-2.5 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300 ${canMove ? "active:cursor-grabbing" : ""} ${dragId === d.id ? "opacity-50" : ""}`}
                  >
                    <div className="text-[12px] font-bold leading-snug text-slate-800">{d.address}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                      {d.assignedTo && <span className="font-semibold text-slate-500">👤 {d.assignedTo}</span>}
                      {d.money && <span className="font-semibold text-slate-600">{d.money}</span>}
                    </div>
                    {(d.topOffer || d.buyerName) && (
                      <div className="mt-0.5 text-[10px] font-semibold text-emerald-700">{d.topOffer ? `💵 best offer ${d.topOffer}` : `🤝 ${d.buyerName}`}</div>
                    )}
                    {d.agingLabel && <div className={`mt-0.5 text-[10px] font-bold ${AGING_CLS[d.agingLevel]}`}>{d.agingLabel}</div>}
                  </div>
                ))}
                {col.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 px-2 py-3 text-center text-[10px] text-slate-300">empty</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
