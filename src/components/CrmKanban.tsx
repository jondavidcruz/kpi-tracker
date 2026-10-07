"use client";
// Acquisitions CRM Kanban — same battle-tested HTML5 DnD as DealKanban
// (set dataTransfer payload, defer state past dragstart). Click a card →
// its opportunity page.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOppStageAction } from "@/app/crm/actions";
import { STAGE_PROB } from "@/lib/crm-shared";

export type CrmCard = {
  id: string;
  title: string;
  contactName: string;
  contactId?: string;
  phone?: string;
  stage: string;
  assignedTo: string;
  tags: string[];
  badges: string[]; // pre-rendered chips: "⏳ 31h at devs", "⏰ task today"…
  money: string;
};
export type CrmColumn = { key: string; label: string; cls: string };
const LANE_TINTS = ["bg-sky-50/70 ring-sky-100", "bg-yellow-50/70 ring-yellow-100", "bg-violet-50/70 ring-violet-100", "bg-amber-50/70 ring-amber-100", "bg-blue-50/70 ring-blue-100", "bg-emerald-50/70 ring-emerald-100", "bg-rose-50/70 ring-rose-100", "bg-indigo-50/70 ring-indigo-100", "bg-teal-50/70 ring-teal-100", "bg-slate-100/70 ring-slate-200/60"];

const FIELDS = [
  ["money", "💵 value"],
  ["badges", "⏳ status badges"],
  ["tags", "# tags"],
  ["rep", "👤 rep"],
  ["title", "🏠 property line"],
] as const;
type FieldKey = (typeof FIELDS)[number][0];

export default function CrmKanban({ columns, cards: initial, counts = {}, sums = {}, listHref = "/crm?view=list" }: { columns: CrmColumn[]; cards: CrmCard[]; counts?: Record<string, number>; sums?: Record<string, number>; listHref?: string }) {
  const [cards, setCards] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  // ⚙ per-person card customization (saved on this device)
  const [show, setShow] = useState<Record<FieldKey, boolean>>({ money: true, badges: true, tags: true, rep: true, title: true });
  const [cfgOpen, setCfgOpen] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem("fo_crm_card_fields"); if (raw) setShow({ ...{ money: true, badges: true, tags: true, rep: true, title: true }, ...JSON.parse(raw) }); } catch { /* defaults */ }
  }, []);
  const toggleField = (k: FieldKey) => {
    const next = { ...show, [k]: !show[k] };
    setShow(next);
    try { localStorage.setItem("fo_crm_card_fields", JSON.stringify(next)); } catch { /* fine */ }
  };

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
        <span className="relative ml-auto">
          <button onClick={() => setCfgOpen((v) => !v)} className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-600 hover:bg-slate-200">⚙ Cards</button>
          {cfgOpen && (
            <span className="absolute right-0 top-7 z-20 flex w-44 flex-col gap-1 rounded-xl bg-white p-2.5 shadow-lg ring-1 ring-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400">Show on cards (just for you)</span>
              {FIELDS.map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                  <input type="checkbox" checked={show[k]} onChange={() => toggleField(k)} /> {label}
                </label>
              ))}
            </span>
          )}
        </span>
      </div>
      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
        {columns.map((col, colIdx) => {
          const colCards = cards.filter((c) => c.stage === col.key);
          const tint = LANE_TINTS[colIdx % LANE_TINTS.length];
          return (
            <div
              key={col.key}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverCol(col.key); } }}
              onDragLeave={() => setOverCol((o) => (o === col.key ? null : o))}
              onDrop={(e) => { e.preventDefault(); drop(col.key); setOverCol(null); }}
              className={`min-w-[270px] flex-1 rounded-2xl p-2.5 ring-1 transition ${overCol === col.key && dragId ? "ring-2 ring-indigo-400 bg-indigo-50/60" : tint}`}
            >
              <div className="mb-0.5 flex items-center justify-between px-1">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${col.cls}`}>{col.label}</span>
                <span className="text-xs font-extrabold tabular-nums text-slate-500">{(counts[col.key] ?? colCards.length).toLocaleString()}</span>
              </div>
              {(sums[col.key] ?? 0) > 0 && (
                <div className="mb-1.5 px-1 text-[9px] font-bold text-slate-400" title="Total value in this stage · weighted by how likely this stage is to close">
                  ${Math.round(sums[col.key]).toLocaleString()} · wtd ${Math.round((sums[col.key] ?? 0) * (STAGE_PROB[col.key] ?? 0)).toLocaleString()}
                </div>
              )}
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
                    className={`cursor-pointer rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:ring-slate-300 active:cursor-grabbing ${dragId === c.id ? "opacity-50" : ""}`}
                  >
                    <div className="text-[14px] font-bold leading-snug text-slate-800">{c.contactName}</div>
                    {show.title && <div className="text-[11px] text-slate-500">{c.title}</div>}
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {show.money && c.money && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">{c.money}</span>}
                      {show.badges && c.badges.map((b, i) => (
                        <span key={i} className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${b.startsWith("⏳") || b.startsWith("🔴") ? "bg-red-50 text-red-700" : b.startsWith("⏰") ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"}`}>{b}</span>
                      ))}
                      {show.tags && c.tags.slice(0, 3).map((t) => (
                        <span key={t} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-600">#{t}</span>
                      ))}
                    </div>
                    {show.rep && c.assignedTo && <div className="mt-1 text-[9px] font-semibold text-slate-400">👤 {c.assignedTo}</div>}
                    {/* GHL-style quick actions (bottom-left) */}
                    <div className="mt-1.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {c.phone && (
                        <button
                          type="button"
                          title={`Call ${c.contactName} from the browser (Telnyx)`}
                          onClick={() => window.dispatchEvent(new CustomEvent("fo-call", { detail: { phone: c.phone, name: c.contactName, oppId: c.id, contactId: c.contactId } }))}
                          className="grid h-7 w-7 place-items-center rounded-md bg-emerald-50 text-[12px] ring-1 ring-emerald-200 hover:bg-emerald-100"
                        >📞</button>
                      )}
                      <a href={`/crm/${c.id}#tasks`} title="Add a task" className="grid h-7 w-7 place-items-center rounded-md bg-slate-50 text-[12px] ring-1 ring-slate-200 hover:bg-slate-100">✅</a>
                      <a href={`/crm/${c.id}#appts`} title="Book an appointment" className="grid h-7 w-7 place-items-center rounded-md bg-slate-50 text-[12px] ring-1 ring-slate-200 hover:bg-slate-100">📅</a>
                      <a href={`/crm/${c.id}#opp`} title="Edit tags" className="grid h-7 w-7 place-items-center rounded-md bg-slate-50 text-[12px] ring-1 ring-slate-200 hover:bg-slate-100">🏷</a>
                      {c.phone && <a href={`sms:${c.phone}`} title="Text" className="grid h-7 w-7 place-items-center rounded-md bg-slate-50 text-[12px] ring-1 ring-slate-200 hover:bg-slate-100">💬</a>}
                    </div>
                  </div>
                ))}
                {colCards.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 px-2 py-3 text-center text-[10px] text-slate-300">empty</div>}
                {(counts[col.key] ?? 0) > colCards.length && (
                  <a href={`${listHref}&stage=${col.key}`} className="block rounded-xl bg-white/70 px-2 py-2 text-center text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 hover:bg-white">
                    + {((counts[col.key] ?? 0) - colCards.length).toLocaleString()} more — open in List
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
