"use client";
// 🎯 Dispositions CRM — the Kanban board of EVERY buyer-agent + developer we're
// following up with, across all dispo deals (Jon 2026-10-20). Columns = the
// follow-up sequence; drag a card to move its stage (saves instantly). Each card
// is tied to its deal, so you always see which buyer belongs to which property.
import { useState, useTransition } from "react";
import Link from "next/link";
import { updateDispoBuyerAction, logDispoBuyerTouchAction } from "@/app/crm/actions";
import { DISPO_BUYER_STAGES, DISPO_BUYER_KINDS, type DispoBuyerStage } from "@/lib/dispo-buyers";

export type FollowupCard = {
  oppId: string; entryId: string; name: string; kind: string;
  phone?: string; email?: string; price?: string; stage: DispoBuyerStage;
  nextFollowUp?: string; lastContact?: string; dealAddr: string;
};

export default function DispoFollowupKanban({ cards: initial, today }: { cards: FollowupCard[]; today: string }) {
  const [cards, setCards] = useState(initial);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const keyOf = (c: FollowupCard) => `${c.oppId}:${c.entryId}`;

  const drop = (stage: DispoBuyerStage) => {
    const card = cards.find((c) => keyOf(c) === dragKey);
    if (!card || card.stage === stage) return;
    setCards(cards.map((c) => (keyOf(c) === dragKey ? { ...c, stage } : c)));
    const fd = new FormData();
    fd.set("oppId", card.oppId); fd.set("entryId", card.entryId); fd.set("field", "stage"); fd.set("value", stage);
    start(async () => { await updateDispoBuyerAction(fd); });
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-[11px] text-slate-400">
        <span>✋ Drag a buyer/agent between stages — it saves instantly. Click a card to open its deal.</span>
        {pending && <span className="font-bold text-amber-600">saving…</span>}
      </div>
      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
        {DISPO_BUYER_STAGES.map((col) => {
          const inCol = cards.filter((c) => c.stage === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => { if (dragKey) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverCol(col.key); } }}
              onDragLeave={() => setOverCol((o) => (o === col.key ? null : o))}
              onDrop={(e) => { e.preventDefault(); drop(col.key); setOverCol(null); }}
              className={`min-w-[190px] flex-1 rounded-2xl bg-slate-100/70 p-2 ring-1 transition ${overCol === col.key && dragKey ? "ring-2 ring-indigo-400 bg-indigo-50/60" : "ring-slate-200/60"}`}
            >
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${col.cls}`}>{col.label}</span>
                <span className="text-xs font-extrabold tabular-nums text-slate-500">{inCol.length}</span>
              </div>
              <div className="space-y-1.5">
                {inCol.map((c) => {
                  const overdue = c.nextFollowUp && c.nextFollowUp <= today && c.stage !== "passed" && c.stage !== "offer_in";
                  const km = DISPO_BUYER_KINDS.find((k) => k.key === c.kind);
                  return (
                    <div
                      key={keyOf(c)}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", keyOf(c)); e.dataTransfer.effectAllowed = "move"; setTimeout(() => setDragKey(keyOf(c)), 0); }}
                      onDragEnd={() => { setDragKey(null); setOverCol(null); }}
                      className={`rounded-xl bg-white p-2.5 text-left shadow-sm ring-1 transition hover:ring-slate-300 active:cursor-grabbing ${overdue ? "ring-red-200" : "ring-slate-200"} ${dragKey === keyOf(c) ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-start gap-1.5">
                        <span className="text-[13px] leading-none" title={km?.label}>{km?.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-bold text-slate-800">{c.name}</div>
                          <Link href={`/crm/${c.oppId}`} className="block truncate text-[10px] font-semibold text-sky-600 hover:underline" title={c.dealAddr}>📦 {c.dealAddr}</Link>
                        </div>
                      </div>
                      {(c.phone || c.price) && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px]">
                          {c.phone && <span className="font-semibold text-slate-500">{c.phone}</span>}
                          {c.price && <span className="font-bold text-emerald-700">💵 {c.price}</span>}
                        </div>
                      )}
                      <div className="mt-1 flex items-center justify-between gap-1">
                        <span className={`text-[9px] font-bold ${overdue ? "text-red-600" : "text-slate-400"}`}>
                          {c.nextFollowUp ? (overdue ? `⏰ due ${c.nextFollowUp}` : `next ${c.nextFollowUp}`) : "no follow-up set"}
                        </span>
                        <form action={logDispoBuyerTouchAction}>
                          <input type="hidden" name="oppId" value={c.oppId} /><input type="hidden" name="entryId" value={c.entryId} />
                          <button className="rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-sky-700" title="Stamp a touch today + bump the next follow-up 3 days">📞 Touch</button>
                        </form>
                      </div>
                    </div>
                  );
                })}
                {inCol.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 px-2 py-3 text-center text-[10px] text-slate-300">empty</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
