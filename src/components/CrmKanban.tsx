"use client";
// Acquisitions CRM Kanban — same battle-tested HTML5 DnD as DealKanban
// (set dataTransfer payload, defer state past dragstart). Click a card →
// its opportunity page.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOppStageAction } from "@/app/crm/actions";

export type CrmCard = {
  id: string;
  title: string;
  contactName: string;
  stage: string;
  assignedTo: string;
  tags: string[];
  badges: string[]; // pre-rendered chips: "⏳ 31h at devs", "⏰ task today"…
  money: string;
};
export type CrmColumn = { key: string; label: string; cls: string };

export default function CrmKanban({ columns, cards: initial }: { columns: CrmColumn[]; cards: CrmCard[] }) {
  const [cards, setCards] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const drop = (stage: string) => {
    const c = cards.find((x) => x.id === dragId);
    if (!c || c.stage === stage) return;
    setCards(cards.map((x) => (x.id === c.id ? { ...x, stage } : x)));
    const fd = new FormData();
    fd.set("id", c.id);
    fd.set("stage", stage);
    start(async () => { await setOppStageAction(fd); });
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-[11px] text-slate-400">
        <span>✋ Drag a card between stages — saves instantly. Click a card to open the full lead.</span>
        {pending && <span className="font-bold text-amber-600">saving…</span>}
      </div>
      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
        {columns.map((col) => {
          const colCards = cards.filter((c) => c.stage === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverCol(col.key); } }}
              onDragLeave={() => setOverCol((o) => (o === col.key ? null : o))}
              onDrop={(e) => { e.preventDefault(); drop(col.key); setOverCol(null); }}
              className={`min-w-[210px] flex-1 rounded-2xl bg-slate-100/70 p-2 ring-1 transition ${overCol === col.key && dragId ? "ring-2 ring-indigo-400 bg-indigo-50/60" : "ring-slate-200/60"} ${col.key === "at_developers" ? "bg-amber-50/70 ring-amber-200" : ""}`}
            >
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${col.cls}`}>{col.label}</span>
                <span className="text-xs font-extrabold tabular-nums text-slate-500">{colCards.length}</span>
              </div>
              <div className="space-y-1.5">
                {colCards.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.effectAllowed = "move";
                      setTimeout(() => setDragId(c.id), 0);
                    }}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onClick={() => router.push(`/crm/${c.id}`)}
                    className={`cursor-pointer rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300 active:cursor-grabbing ${dragId === c.id ? "opacity-50" : ""}`}
                  >
                    <div className="text-[12px] font-bold leading-snug text-slate-800">{c.contactName}</div>
                    <div className="text-[10px] text-slate-500">{c.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {c.money && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">{c.money}</span>}
                      {c.badges.map((b, i) => (
                        <span key={i} className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${b.startsWith("⏳") || b.startsWith("🔴") ? "bg-red-50 text-red-700" : b.startsWith("⏰") ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"}`}>{b}</span>
                      ))}
                      {c.tags.slice(0, 3).map((t) => (
                        <span key={t} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-600">#{t}</span>
                      ))}
                    </div>
                    {c.assignedTo && <div className="mt-1 text-[9px] font-semibold text-slate-400">👤 {c.assignedTo}</div>}
                  </div>
                ))}
                {colCards.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 px-2 py-3 text-center text-[10px] text-slate-300">empty</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
