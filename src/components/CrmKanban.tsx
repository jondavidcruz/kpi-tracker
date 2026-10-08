"use client";
// Acquisitions CRM Kanban — same battle-tested HTML5 DnD as DealKanban
// (set dataTransfer payload, defer state past dragstart). Click a card →
// its opportunity page.
import { useEffect, useLayoutEffect, useState, useTransition } from "react";
import { setOppStageAction, addCrmTaskAction, addCrmApptAction, addOppTagAction, sendCrmSmsAction, bulkOppAction } from "@/app/crm/actions";
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
  email?: string;
  smsUnread?: number;   // inbound texts not yet read/answered
  valueNum?: number;
  updatedAt?: string;   // ISO — drives sort + age coloring
  createdAt?: string;
};
// 🎨 GHL-style age coloring (Jon 2026-10-08): customizable ranges + colors,
// saved per device. Days since last stage activity (updatedAt).
type ColorRange = { max: number | null; color: string };
const DEFAULT_RANGES: ColorRange[] = [
  { max: 10, color: "#22c55e" }, { max: 20, color: "#eab308" }, { max: 30, color: "#ef4444" }, { max: null, color: "#06b6d4" },
];
type SortKey = "fresh" | "created" | "value" | "name";
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

export default function CrmKanban({ columns, cards: initial, counts = {}, sums = {}, listHref = "/crm?view=list", canSms = false, reps = [] }: { columns: CrmColumn[]; cards: CrmCard[]; counts?: Record<string, number>; sums?: Record<string, number>; listHref?: string; canSms?: boolean; reps?: string[] }) {
  const [cards, setCards] = useState(initial);
  // THE 27-vs-112 bug (Jon 2026-10-08): this component stays mounted when you
  // switch pipeline tabs, so the drag-and-drop card state kept showing the
  // PREVIOUS pipeline's cards while the columns changed — the catch-all then
  // dumped all of them into column 1 (112 = Nick's whole board capped at 60/col).
  // Resync local card state whenever the server sends a fresh set.
  useEffect(() => { setCards(initial); }, [initial]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // ⚙ per-person card customization (saved on this device)
  const [show, setShow] = useState<Record<FieldKey, boolean>>({ money: true, badges: true, tags: true, rep: true, repTop: false, title: true });
  const [cfgOpen, setCfgOpen] = useState(false);
  // 👁 privacy blur (phone + address), 🔀 sort, 🎨 coloring, ☑️ multi-select
  const [privacy, setPrivacy] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("fresh");
  const [colorOn, setColorOn] = useState(false);
  const [ranges, setRanges] = useState<ColorRange[]>(DEFAULT_RANGES);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState({ op: "stage", val: "" });
  useLayoutEffect(() => {
    try {
      if (localStorage.getItem("fo_crm_privacy") === "1") setPrivacy(true);
      const sk = localStorage.getItem("fo_crm_sort"); if (sk) setSortKey(sk as SortKey);
      const cc = localStorage.getItem("fo_crm_color");
      if (cc) { const j = JSON.parse(cc); setColorOn(!!j.on); if (Array.isArray(j.ranges)) setRanges(j.ranges); }
    } catch { /* defaults */ }
  }, []);
  const savePrivacy = (v: boolean) => { setPrivacy(v); try { localStorage.setItem("fo_crm_privacy", v ? "1" : "0"); } catch { /* ok */ } };
  const saveSort = (v: SortKey) => { setSortKey(v); try { localStorage.setItem("fo_crm_sort", v); } catch { /* ok */ } };
  const saveColor = (on: boolean, r: ColorRange[]) => { setColorOn(on); setRanges(r); try { localStorage.setItem("fo_crm_color", JSON.stringify({ on, ranges: r })); } catch { /* ok */ } };
  const ageColor = (c: CrmCard): string | null => {
    if (!colorOn || !c.updatedAt) return null;
    const days = (Date.now() - new Date(c.updatedAt).getTime()) / 86400_000;
    for (const r of ranges) if (r.max == null || days <= r.max) return r.color;
    return null;
  };
  const sortCards = (arr: CrmCard[]): CrmCard[] => {
    const a = [...arr];
    if (sortKey === "value") a.sort((x, y) => (y.valueNum ?? 0) - (x.valueNum ?? 0));
    else if (sortKey === "name") a.sort((x, y) => x.contactName.localeCompare(y.contactName));
    else if (sortKey === "created") a.sort((x, y) => (y.createdAt ?? "").localeCompare(x.createdAt ?? ""));
    return a; // "fresh" = server order (updated desc)
  };
  const toggleSel = (id: string) => setSelected((s2) => { const n = new Set(s2); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const runBulk = () => {
    if (!selected.size || !bulk.val.trim()) return;
    const fd = new FormData();
    for (const id of selected) fd.append("ids", id);
    fd.set("op", bulk.op); fd.set("val", bulk.val.trim());
    start(async () => { await bulkOppAction(fd); window.location.reload(); });
  };
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
  // useLayoutEffect = restore the saved collapse state BEFORE first paint, so
  // lanes don't flash open then bounce shut on page load (Jon 2026-10-08).
  useLayoutEffect(() => {
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
        <span className="ml-auto flex items-center gap-1.5">
          <button onClick={() => savePrivacy(!privacy)} title={privacy ? "Show phone + address" : "Privacy: blur phone + address (screen-share safe)"} className={`rounded-lg px-2.5 py-1 font-bold ${privacy ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{privacy ? "🙈" : "👁"}</button>
          <select value={sortKey} onChange={(e) => saveSort(e.target.value as SortKey)} title="Sort cards inside each stage" className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-bold text-slate-600">
            <option value="fresh">↕ Last activity</option>
            <option value="created">🆕 Newest created</option>
            <option value="value">💵 Highest value</option>
            <option value="name">🔤 Name A–Z</option>
          </select>
          <button onClick={() => { setSelecting((v) => !v); setSelected(new Set()); }} className={`rounded-lg px-2.5 py-1 font-bold ${selecting ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>☑ Select</button>
        </span>
        <span className="relative">
          <button onClick={() => setCfgOpen((v) => !v)} className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-600 hover:bg-slate-200">⚙ Cards</button>
          {cfgOpen && (
            <span className="absolute right-0 top-7 z-20 flex w-44 flex-col gap-1 rounded-xl bg-white p-2.5 shadow-lg ring-1 ring-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400">Show on cards (just for you)</span>
              {FIELDS.map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                  <input type="checkbox" checked={show[k]} onChange={() => toggleField(k)} /> {label}
                </label>
              ))}
              <span className="mt-1 border-t border-slate-100 pt-1.5 text-[10px] font-bold uppercase text-slate-400">🎨 Card coloring (days in stage)</span>
              <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                <input type="checkbox" checked={colorOn} onChange={(e) => saveColor(e.target.checked, ranges)} /> color borders by age
              </label>
              {ranges.map((r, i) => (
                <span key={i} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <input type="color" value={r.color} onChange={(e) => { const n = [...ranges]; n[i] = { ...n[i], color: e.target.value }; saveColor(colorOn, n); }} className="h-5 w-7 cursor-pointer rounded border border-slate-200" />
                  {r.max == null ? <span className="flex-1">everything older</span> : (
                    <span className="flex flex-1 items-center gap-1">up to <input type="number" min={1} value={r.max} onChange={(e) => { const n = [...ranges]; n[i] = { ...n[i], max: Math.max(1, Number(e.target.value) || 1) }; saveColor(colorOn, n); }} className="w-12 rounded border border-slate-200 px-1 py-0.5" /> days</span>
                  )}
                </span>
              ))}
            </span>
          )}
        </span>
      </div>
      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
        {columns.map((col, colIdx) => {
          const colCards = sortCards(cards.filter((c) => c.stage === col.key || (colIdx === 0 && !columns.some((cc) => cc.key === c.stage))));
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
                    onClick={() => selecting ? toggleSel(c.id) : window.dispatchEvent(new CustomEvent("fo-quickview", { detail: { id: c.id } }))}
                    style={ageColor(c) ? { border: `2px solid ${ageColor(c)}` } : undefined}
                    className={`cursor-pointer rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:ring-slate-300 active:cursor-grabbing ${dragId === c.id ? "opacity-50" : ""} ${selecting && selected.has(c.id) ? "ring-2 ring-indigo-500" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      {selecting && <input type="checkbox" readOnly checked={selected.has(c.id)} className="mr-1 mt-0.5 h-4 w-4 shrink-0 accent-indigo-600" />}
                      {/* name → FULL card page; anywhere else on the card → quick view */}
                      <a href={`/crm/${c.id}`} onClick={(e) => e.stopPropagation()} title="Open the full lead page" className="text-[14px] font-bold leading-snug text-slate-800 hover:text-indigo-600 hover:underline">{c.contactName}</a>
                      {show.repTop && c.assignedTo && <span title={c.assignedTo} className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-navy text-[9px] font-extrabold text-white">{c.assignedTo.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</span>}
                    </div>
                    {show.title && <div className="text-[11px] text-slate-500">{c.title}</div>}
                    {c.address && c.address !== c.title && <div className={`truncate text-[10px] text-slate-400 ${privacy ? "select-none blur-[3px]" : ""}`}>📍 {c.address}</div>}
                    {c.phone && <div className={`text-[10px] font-semibold text-slate-500 ${privacy ? "select-none blur-[3px]" : ""}`}>📞 {c.phone}</div>}
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
                      {canSms && c.phone && (
                        <button type="button" title={c.smsUnread ? `${c.smsUnread} unread text${c.smsUnread > 1 ? "s" : ""} — open the thread` : "Text via our Telnyx number"} onClick={() => setQuick(quick?.id === c.id && quick.kind === "sms" ? null : { id: c.id, contactId: c.contactId, kind: "sms", phone: c.phone })} className="relative grid h-7 w-7 place-items-center rounded-md bg-sky-50 text-[12px] ring-1 ring-sky-200 hover:bg-sky-100">💬
                          {!!c.smsUnread && <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-0.5 text-[8px] font-extrabold text-white">{c.smsUnread}</span>}
                        </button>
                      )}
                      {c.email && <button type="button" title={`Email ${c.contactName} (${c.email})`} onClick={() => window.dispatchEvent(new CustomEvent("fo-quickview", { detail: { id: c.id, tab: "email" } }))} className="grid h-7 w-7 place-items-center rounded-md bg-amber-50 text-[12px] ring-1 ring-amber-200 hover:bg-amber-100">✉️</button>}
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
      {selecting && (
        <div className="sticky bottom-3 z-30 mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-xs text-white shadow-2xl">
          <span className="font-extrabold">{selected.size} selected</span>
          <button onClick={() => setSelected(new Set(cards.map((c) => c.id)))} className="rounded bg-white/10 px-2 py-1 font-bold hover:bg-white/20">Select all visible</button>
          <select value={bulk.op} onChange={(e) => setBulk({ op: e.target.value, val: "" })} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-800">
            <option value="stage">→ Move to stage</option>
            <option value="assign">👤 Reassign to</option>
            <option value="tag">🏷 Add tag</option>
          </select>
          {bulk.op === "stage" && (
            <select value={bulk.val} onChange={(e) => setBulk({ ...bulk, val: e.target.value })} className="rounded-lg px-2 py-1 text-xs text-slate-800">
              <option value="">stage…</option>
              {columns.map((cc) => <option key={cc.key} value={cc.key}>{cc.label}</option>)}
            </select>
          )}
          {bulk.op === "assign" && (
            <select value={bulk.val} onChange={(e) => setBulk({ ...bulk, val: e.target.value })} className="rounded-lg px-2 py-1 text-xs text-slate-800">
              <option value="">rep…</option>
              {reps.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          {bulk.op === "tag" && <input value={bulk.val} onChange={(e) => setBulk({ ...bulk, val: e.target.value })} placeholder="tag…" className="rounded-lg px-2 py-1 text-xs text-slate-800" />}
          <button onClick={runBulk} disabled={!selected.size || !bulk.val} className="rounded-lg bg-emerald-500 px-3 py-1.5 font-extrabold text-white hover:bg-emerald-600 disabled:opacity-40">Apply to {selected.size}</button>
          <button onClick={() => { setSelecting(false); setSelected(new Set()); }} className="ml-auto rounded bg-white/10 px-2 py-1 font-bold hover:bg-white/20">Done</button>
        </div>
      )}
    </div>
  );
}
