"use client";
// Acquisitions CRM Kanban — same battle-tested HTML5 DnD as DealKanban
// (set dataTransfer payload, defer state past dragstart). Click a card →
// its opportunity page.
import { useEffect, useState, useTransition } from "react";
import { setOppStageAction, addCrmTaskAction, addCrmApptAction, addOppTagAction, sendCrmSmsAction } from "@/app/crm/actions";
import { STAGE_PROB } from "@/lib/crm-shared";

export type CrmCard = {
  id: string;
  title: string;
  contactName: string;
  address?: string;
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
  ["repTop", "👤 owner top-right (GHL style)"],
  ["title", "🏠 property line"],
] as const;
type FieldKey = (typeof FIELDS)[number][0];

export default function CrmKanban({ columns, cards: initial, counts = {}, sums = {}, listHref = "/crm?view=list", canSms = false }: { columns: CrmColumn[]; cards: CrmCard[]; counts?: Record<string, number>; sums?: Record<string, number>; listHref?: string; canSms?: boolean }) {
  const [cards, setCards] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // ⚙ per-person card customization (saved on this device)
  const [show, setShow] = useState<Record<FieldKey, boolean>>({ money: true, badges: true, tags: true, rep: true, repTop: false, title: true });
  const [cfgOpen, setCfgOpen] = useState(false);
  // quick-add popover: {cardId, kind} — one open at a time
  const [quick, setQuick] = useState<{ id: string; contactId?: string; kind: "task" | "appt" | "tag" | "sms"; phone?: string } | null>(null);
  const [qa, setQa] = useState({ title: "", due: "", when: "", tag: "", sms: "" });
  const [, startQuick] = useTransition();
  const submitQuick = () => {
    if (!quick) return;
    const fd = new FormData();
    if (quick.kind === "task") {
      if (!qa.title.trim()) return;
      fd.set("oppId", quick.id); fd.set("contactId", quick.contactId ?? ""); fd.set("title", qa.title); fd.set("due", qa.due);
      startQuick(async () => { await addCrmTaskAction(fd); });
    } else if (quick.kind === "appt") {
      if (!qa.title.trim() || !qa.when) return;
      fd.set("oppId", quick.id); fd.set("contactId", quick.contactId ?? ""); fd.set("title", qa.title); fd.set("at", qa.when);
      startQuick(async () => { await addCrmApptAction(fd); });
    } else if (quick.kind === "tag") {
      if (!qa.tag.trim()) return;
      fd.set("id", quick.id); fd.set("tag", qa.tag);
      startQuick(async () => { await addOppTagAction(fd); });
      setCards((cs) => cs.map((c) => (c.id === quick.id ? { ...c, tags: [...c.tags, qa.tag.trim()] } : c)));
    } else if (quick.kind === "sms") {
      if (!qa.sms.trim() || !quick.phone) return;
      fd.set("oppId", quick.id); fd.set("contactId", quick.contactId ?? ""); fd.set("to", quick.phone); fd.set("text", qa.sms);
      startQuick(async () => { await sendCrmSmsAction(fd); });
    }
    setQuick(null); setQa({ title: "", due: "", when: "", tag: "", sms: "" });
  };
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { const raw = localStorage.getItem("fo_crm_collapsed"); if (raw) setCollapsed(JSON.parse(raw)); } catch { /* none */ }
  }, []);
  const toggleCollapse = (k: string) => {
    const next = { ...collapsed, [k]: !collapsed[k] };
    setCollapsed(next);
    try { localStorage.setItem("fo_crm_collapsed", JSON.stringify(next)); } catch { /* fine */ }
  };
  useEffect(() => {
    try { const raw = localStorage.getItem("fo_crm_card_fields"); if (raw) setShow({ ...{ money: true, badges: true, tags: true, rep: true, repTop: false, title: true }, ...JSON.parse(raw) }); } catch { /* defaults */ }
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
          const colCards = cards.filter((c) => c.stage === col.key || (colIdx === 0 && !columns.some((cc) => cc.key === c.stage)));
          const tint = LANE_TINTS[colIdx % LANE_TINTS.length];
          if (collapsed[col.key]) {
            return (
              <button
                key={col.key}
                onClick={() => toggleCollapse(col.key)}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverCol(col.key); } }}
                onDrop={(e) => { e.preventDefault(); drop(col.key); setOverCol(null); }}
                title={`${col.label} — click to expand`}
                className={`flex w-11 shrink-0 flex-col items-center gap-2 rounded-2xl p-2 ring-1 transition hover:ring-slate-300 ${overCol === col.key && dragId ? "ring-2 ring-indigo-400 bg-indigo-50/60" : tint}`}
              >
                <span className="text-xs font-extrabold text-slate-500">›</span>
                <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-600 ring-1 ring-slate-200">{(counts[col.key] ?? colCards.length).toLocaleString()}</span>
                <span className="text-[10px] font-bold tracking-wide text-slate-500" style={{ writingMode: "vertical-rl" }}>{col.label}</span>
              </button>
            );
          }
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
                <span className="flex items-center gap-1">
                  <span className="text-xs font-extrabold tabular-nums text-slate-500">{(counts[col.key] ?? colCards.length).toLocaleString()}</span>
                  <button onClick={() => toggleCollapse(col.key)} title="Minimize this stage" className="grid h-5 w-5 place-items-center rounded text-[11px] font-extrabold text-slate-400 hover:bg-white/70 hover:text-slate-600">‹</button>
                </span>
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
                    onClick={() => window.dispatchEvent(new CustomEvent("fo-quickview", { detail: { id: c.id } }))}
                    className={`cursor-pointer rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:ring-slate-300 active:cursor-grabbing ${dragId === c.id ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      {/* name → FULL card page; anywhere else on the card → quick view */}
                      <a href={`/crm/${c.id}`} onClick={(e) => e.stopPropagation()} title="Open the full lead page" className="text-[14px] font-bold leading-snug text-slate-800 hover:text-indigo-600 hover:underline">{c.contactName}</a>
                      {show.repTop && c.assignedTo && <span title={c.assignedTo} className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-navy text-[9px] font-extrabold text-white">{c.assignedTo.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</span>}
                    </div>
                    {show.title && <div className="text-[11px] text-slate-500">{c.title}</div>}
                    {c.address && c.address !== c.title && <div className="truncate text-[10px] text-slate-400">📍 {c.address}</div>}
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
                    {/* GHL-style quick actions — popovers, zero page hops */}
                    <div className="relative mt-1.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {c.phone && (
                        <button
                          type="button"
                          title={`Call ${c.contactName} from the browser (Telnyx)`}
                          onClick={() => window.dispatchEvent(new CustomEvent("fo-call", { detail: { phone: c.phone, name: c.contactName, oppId: c.id, contactId: c.contactId } }))}
                          className="grid h-7 w-7 place-items-center rounded-md bg-emerald-50 text-[12px] ring-1 ring-emerald-200 hover:bg-emerald-100"
                        >📞</button>
                      )}
                      <button type="button" title="Add a task" onClick={() => setQuick(quick?.id === c.id && quick.kind === "task" ? null : { id: c.id, contactId: c.contactId, kind: "task" })} className="grid h-7 w-7 place-items-center rounded-md bg-slate-50 text-[12px] ring-1 ring-slate-200 hover:bg-slate-100">✅</button>
                      <button type="button" title="Book an appointment" onClick={() => setQuick(quick?.id === c.id && quick.kind === "appt" ? null : { id: c.id, contactId: c.contactId, kind: "appt" })} className="grid h-7 w-7 place-items-center rounded-md bg-slate-50 text-[12px] ring-1 ring-slate-200 hover:bg-slate-100">📅</button>
                      <button type="button" title="Add a tag" onClick={() => setQuick(quick?.id === c.id && quick.kind === "tag" ? null : { id: c.id, kind: "tag" })} className="grid h-7 w-7 place-items-center rounded-md bg-slate-50 text-[12px] ring-1 ring-slate-200 hover:bg-slate-100">🏷</button>
                      {canSms && c.phone && <button type="button" title="Text via our Telnyx number" onClick={() => setQuick(quick?.id === c.id && quick.kind === "sms" ? null : { id: c.id, contactId: c.contactId, kind: "sms", phone: c.phone })} className="grid h-7 w-7 place-items-center rounded-md bg-sky-50 text-[12px] ring-1 ring-sky-200 hover:bg-sky-100">💬</button>}
                      {quick?.id === c.id && (
                        <span className="absolute left-0 top-9 z-30 flex w-60 flex-col gap-1.5 rounded-xl bg-white p-2.5 shadow-xl ring-1 ring-slate-200">
                          {quick.kind === "task" && (<>
                            <input autoFocus value={qa.title} onChange={(e) => setQa({ ...qa, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submitQuick()} placeholder="Task…" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                            <input type="date" value={qa.due} onChange={(e) => setQa({ ...qa, due: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                          </>)}
                          {quick.kind === "appt" && (<>
                            <input autoFocus value={qa.title} onChange={(e) => setQa({ ...qa, title: e.target.value })} placeholder="Appointment…" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                            <input type="datetime-local" value={qa.when} onChange={(e) => setQa({ ...qa, when: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                          </>)}
                          {quick.kind === "tag" && (
                            <input autoFocus value={qa.tag} onChange={(e) => setQa({ ...qa, tag: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submitQuick()} placeholder="Tag… (Enter)" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                          )}
                          {quick.kind === "sms" && (
                            <textarea autoFocus value={qa.sms} onChange={(e) => setQa({ ...qa, sms: e.target.value })} rows={3} placeholder={`Text ${c.contactName.split(" ")[0]} from our Telnyx line…`} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                          )}
                          <span className="flex gap-1.5">
                            <button type="button" onClick={submitQuick} className="flex-1 rounded-lg bg-slate-900 px-2 py-1.5 text-xs font-bold text-white hover:bg-slate-700">{quick.kind === "sms" ? "Send SMS" : "Add"}</button>
                            <button type="button" onClick={() => setQuick(null)} className="rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-bold text-slate-500">✕</button>
                          </span>
                        </span>
                      )}
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
