"use client";
// Acquisitions CRM Kanban — same battle-tested HTML5 DnD as DealKanban
// (set dataTransfer payload, defer state past dragstart). Click a card →
// its opportunity page.
import { useEffect, useLayoutEffect, useState, useTransition } from "react";
import { setOppStageAction, addCrmTaskAction, addCrmApptAction, addOppTagAction, sendCrmSmsAction, bulkOppAction, bulkOppStageAction, addCrmNoteAction } from "@/app/crm/actions";
import { setBuilderSizeAction } from "@/app/actions";
import { builderSizeMeta } from "@/lib/builder-size";
import { STAGE_PROB, titleCase } from "@/lib/crm-shared";
import { formatAddress } from "@/lib/address";
import { stageHelp } from "@/lib/stage-help";

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
  lastTouch?: string;   // ISO of the last REAL human activity (note/call/text/email/task); "" = never touched
  stageMoved?: boolean; // did this lead ever actually change stage? (so "in stage" isn't a dupe of "in system")
  apn?: string;         // parcel number — shown in place of address for land
  apptDueToday?: boolean; // 📅 appointment due today → red card
  taskDueToday?: boolean; // ⏰ task due today → green card
  followUpDue?: boolean;  // 📞 follow-up due/overdue → blue card
  nextTask?: string;      // next upcoming (after today) task due date — green chip
  nextAppt?: string;      // next upcoming (after today) appointment ISO — red chip
  leadType?: { label: string; cls: string }; // 🏷 seller / land seller / buyer agent / developer — top-right
  parcels?: number; // 📦 how many parcels on this deal (>1 shows a badge)
  acres?: number;   // ⛰️ parcel size — shown as a chip + searchable by acre range
  offers?: { live: number; goal: number }; // 💰 offers received vs the 3-offer goal
  staleStage?: string;  // ⚠️ stored stage no longer in this pipeline (rename orphan) — real stage to show
  gate?: { cleared: boolean; label: string }; // 🚦 Option B — this stage's SOP gate status
  builderSize?: "mompop" | "big"; // 🏠🏢 developer cards — mom & pop (work first) vs big builder
  waterfront?: boolean; // 🌊 land is on/near water — market these first (rate-proof buyers)
};
// 🎨 GHL-style age coloring (Jon 2026-10-08): customizable ranges + colors,
// saved per device. Days since last stage activity (updatedAt).
type ColorRange = { max: number | null; color: string };
const DEFAULT_RANGES: ColorRange[] = [
  { max: 10, color: "#22c55e" }, { max: 20, color: "#eab308" }, { max: 30, color: "#ef4444" }, { max: null, color: "#06b6d4" },
];
type SortKey = "untouched" | "fresh" | "created" | "value" | "name" | "mompop";
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

export default function CrmKanban({ columns, cards: initial, counts = {}, sums = {}, listHref = "/crm?view=list", canSms = false, canCall = false, reps = [], pipelineNames = [], pipelineGroups = {}, pipelineStages = {}, currentPipeline = "", who = "all", dialerBase = "", addressFirst = false }: { columns: CrmColumn[]; cards: CrmCard[]; counts?: Record<string, number>; sums?: Record<string, number>; listHref?: string; canSms?: boolean; canCall?: boolean; reps?: string[]; pipelineNames?: string[]; pipelineGroups?: Record<string, "acquisitions" | "dispositions">; pipelineStages?: Record<string, { key: string; label: string }[]>; currentPipeline?: string; who?: string; dialerBase?: string; addressFirst?: boolean }) {
  const [cards, setCards] = useState(initial);
  // THE 27-vs-112 bug (Jon 2026-10-08): this component stays mounted when you
  // switch pipeline tabs, so the drag-and-drop card state kept showing the
  // PREVIOUS pipeline's cards while the columns changed — the catch-all then
  // dumped all of them into column 1 (112 = Nick's whole board capped at 60/col).
  // Resync local card state whenever the server sends a fresh set.
  useEffect(() => { setCards(initial); }, [initial]);
  // 🏠🏢 Correct a developer's mom-and-pop / big-builder tag (optimistic + saved).
  const flipBuilderSize = (id: string, next: "mompop" | "big") => {
    setCards((cur) => cur.map((c) => (c.id === id ? { ...c, builderSize: next } : c)));
    const fd = new FormData(); fd.set("id", id); fd.set("size", next);
    setBuilderSizeAction(fd).catch(() => {});
  };
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // ⚙ per-person card customization (saved on this device)
  const [show, setShow] = useState<Record<FieldKey, boolean>>({ money: true, badges: true, tags: true, rep: true, title: true });
  const [cfgOpen, setCfgOpen] = useState(false);
  // 👁 privacy blur (phone + address), 🔀 sort, 🎨 coloring, ☑️ multi-select
  const [privacy, setPrivacy] = useState(false);
  // Default: UNTOUCHED first (Jon 2026-10-27) — leads nobody has worked rise to the top,
  // and the moment you log a touch/note the lead drops toward the bottom.
  const [sortKey, setSortKey] = useState<SortKey>("untouched");
  const [colorOn, setColorOn] = useState(false);
  const [ranges, setRanges] = useState<ColorRange[]>(DEFAULT_RANGES);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState({ op: "stage", val: "", val2: "" });
  // when the rep clicks a stage's "select all N", we target the WHOLE stage
  // server-side (every lead, not just the loaded ~60). null = id-based select.
  const [stageScope, setStageScope] = useState<{ stage: string; count: number } | null>(null);
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
    // "untouched" = never-touched first, then oldest touch → most-recently-touched last.
    else if (sortKey === "untouched") a.sort((x, y) => (x.lastTouch ? new Date(x.lastTouch).getTime() : 0) - (y.lastTouch ? new Date(y.lastTouch).getTime() : 0));
    // 🏠 "mompop" = mom & pop builders first (work first), then untouched within each group.
    else if (sortKey === "mompop") a.sort((x, y) => ((x.builderSize === "mompop" ? 0 : 1) - (y.builderSize === "mompop" ? 0 : 1)) || ((x.lastTouch ? new Date(x.lastTouch).getTime() : 0) - (y.lastTouch ? new Date(y.lastTouch).getTime() : 0)));
    return a; // "fresh" = server order (updated desc)
  };
  const toggleSel = (id: string) => { setStageScope(null); setSelected((s2) => { const n = new Set(s2); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  // "select all N" on a stage header → whole-stage scope + visually tick loaded cards
  const selectWholeStage = (stageKey: string) => {
    setSelecting(true);
    const ids = cards.filter((c) => c.stage === stageKey).map((c) => c.id);
    setSelected(new Set(ids));
    setStageScope({ stage: stageKey, count: counts[stageKey] ?? ids.length });
  };
  const runBulk = () => {
    if (bulk.op !== "delete" && !bulk.val.trim()) return;
    // whole-stage scope → server applies to EVERY lead in the stage
    if (stageScope) {
      if (bulk.op === "delete" && !confirm(`Archive ALL ${stageScope.count} lead(s) in this stage? They can be restored.`)) return;
      const fd = new FormData();
      fd.set("pipeline", currentPipeline); fd.set("stage", stageScope.stage); fd.set("who", who);
      fd.set("op", bulk.op); fd.set("val", bulk.val.trim());
      if (bulk.op === "pipeline" && bulk.val2) fd.set("targetStage", bulk.val2);
      start(async () => { await bulkOppStageAction(fd); window.location.reload(); });
      return;
    }
    if (!selected.size) return;
    const fd = new FormData();
    for (const id of selected) fd.append("ids", id);
    fd.set("op", bulk.op); fd.set("val", bulk.val.trim());
    if (bulk.op === "pipeline" && bulk.val2) fd.set("targetStage", bulk.val2);
    if (bulk.op === "delete" && !confirm(`Archive ${selected.size} selected lead(s)? They can be restored.`)) return;
    start(async () => { await bulkOppAction(fd); window.location.reload(); });
  };
  // quick-add popover: {cardId, kind} — one open at a time
  const [quick, setQuick] = useState<{ id: string; contactId?: string; kind: "task" | "appt" | "tag" | "sms" | "note"; phone?: string } | null>(null);
  const [qa, setQa] = useState({ title: "", due: "", when: "", tag: "", sms: "", note: "", assignee: "", dueTime: "" });
  const [, startQuick] = useTransition();
  const submitQuick = () => {
    if (!quick) return;
    const fd = new FormData();
    if (quick.kind === "task") {
      if (!qa.title.trim()) return;
      fd.set("oppId", quick.id); fd.set("contactId", quick.contactId ?? ""); fd.set("title", qa.title); fd.set("due", qa.due);
      if (qa.dueTime) fd.set("dueTime", qa.dueTime);
      if (qa.assignee) fd.set("assignedTo", qa.assignee);
      startQuick(async () => { await addCrmTaskAction(fd); });
    } else if (quick.kind === "appt") {
      if (!qa.title.trim() || !qa.when) return;
      fd.set("oppId", quick.id); fd.set("contactId", quick.contactId ?? ""); fd.set("title", qa.title); fd.set("at", qa.when);
      if (qa.assignee) fd.set("withWho", qa.assignee);
      startQuick(async () => { await addCrmApptAction(fd); });
    } else if (quick.kind === "tag") {
      if (!qa.tag.trim()) return;
      fd.set("id", quick.id); fd.set("tag", qa.tag);
      startQuick(async () => { await addOppTagAction(fd); });
      setCards((cs) => cs.map((c) => (c.id === quick.id ? { ...c, tags: [...c.tags, qa.tag.trim()] } : c)));
    } else if (quick.kind === "note") {
      if (!qa.note.trim()) return;
      fd.set("oppId", quick.id); fd.set("contactId", quick.contactId ?? ""); fd.set("body", qa.note);
      startQuick(async () => { await addCrmNoteAction(fd); });
    } else if (quick.kind === "sms") {
      if (!qa.sms.trim() || !quick.phone) return;
      fd.set("oppId", quick.id); fd.set("contactId", quick.contactId ?? ""); fd.set("to", quick.phone); fd.set("text", qa.sms);
      startQuick(async () => { await sendCrmSmsAction(fd); });
    }
    // Notes: stay put so you can keep jotting (Jon 2026-10-20: "it goes back to the
    // pipeline — make it stay in the same field"). Everything else closes the popover.
    if (quick.kind === "note") { setQa((p) => ({ ...p, note: "" })); }
    else { setQuick(null); setQa({ title: "", due: "", when: "", tag: "", sms: "", note: "", assignee: "", dueTime: "" }); }
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
    try { const raw = localStorage.getItem("fo_crm_card_fields"); if (raw) setShow({ ...{ money: true, badges: true, tags: true, rep: true, title: true }, ...JSON.parse(raw) }); } catch { /* defaults */ }
  }, []);
  const toggleField = (k: FieldKey) => {
    const next = { ...show, [k]: !show[k] };
    setShow(next);
    try { localStorage.setItem("fo_crm_card_fields", JSON.stringify(next)); } catch { /* fine */ }
  };

  const drop = (stage: string) => {
    const c = cards.find((x) => x.id === dragId);
    // Clear the drag state HERE, not only in onDragEnd — moving the card to a new
    // column re-renders it before onDragEnd can fire, which left the card stuck at
    // opacity-50 ("grayed out") after a move (Jon 2026-10-20).
    setDragId(null); setOverCol(null);
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
            <option value="untouched">✋ Untouched first</option>
            <option value="fresh">↕ Last activity</option>
            <option value="created">🆕 Newest created</option>
            <option value="value">💵 Highest value</option>
            <option value="name">🔤 Name A–Z</option>
            {cards.some((c) => c.builderSize) && <option value="mompop">🏠 Mom &amp; Pop first</option>}
          </select>
          <button onClick={() => { setSelecting((v) => !v); setSelected(new Set()); setStageScope(null); }} className={`rounded-lg px-2.5 py-1 font-bold ${selecting ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>☑ Select</button>
          {/* 🔑 What the card colors mean (Jon 2026-10-27: define task vs appt vs follow-up). */}
          <span className="flex flex-wrap items-center gap-2 text-[9px] font-semibold text-slate-400" title="A card is tinted by what's due: 📅 Appointment = a scheduled meeting · ✅ Task = a to-do you assigned · 📞 Follow-up = a date to reach back out">
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" /> 📅 appt today</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> ✅ task today</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" /> 📞 follow-up due</span>
          </span>
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
                <span className="flex items-center gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${col.cls}`}>{col.label}</span>
                  {(() => { const h = stageHelp(col.label); return h ? (
                    <span className="group/help relative">
                      <span className="grid h-4 w-4 cursor-help place-items-center rounded-full bg-white/80 text-[9px] font-extrabold text-slate-400 ring-1 ring-slate-200 hover:text-slate-600">i</span>
                      <span className="pointer-events-none absolute left-0 top-5 z-50 hidden w-60 rounded-xl bg-slate-900 p-2.5 text-left text-white shadow-xl group-hover/help:block">
                        <span className="block text-[11px] font-extrabold">{h.title}</span>
                        <span className="mt-0.5 block text-[10px] font-medium leading-snug text-slate-200">{h.desc}</span>
                      </span>
                    </span>
                  ) : null; })()}
                </span>
                <span className="flex items-center gap-1">
                  {dialerBase && (counts[col.key] ?? colCards.length) > 0 && (
                    // ☎ power-dial this whole column (crm-enhancer 2026-10-16) — the
                    // one-click answer to "hundreds of never-called leads in NEW"
                    <a href={`${dialerBase}&stage=${encodeURIComponent(col.key)}`} title={`Power-dial every lead in "${col.label}" — least-recently touched first`} className="grid h-5 w-5 place-items-center rounded bg-white/70 text-[11px] font-bold text-emerald-600 hover:bg-emerald-500 hover:text-white">☎</a>
                  )}
                  {(counts[col.key] ?? colCards.length) > 0 && (
                    <button onClick={() => selectWholeStage(col.key)} title={`Select all ${(counts[col.key] ?? colCards.length).toLocaleString()} leads in this stage for a bulk action`} className={`grid h-5 w-5 place-items-center rounded text-[11px] font-bold ${stageScope?.stage === col.key ? "bg-indigo-600 text-white" : "bg-white/70 text-slate-400 hover:text-indigo-600"}`}>☑</button>
                  )}
                  <span className="text-xs font-extrabold tabular-nums text-slate-500">{(counts[col.key] ?? colCards.length).toLocaleString()}</span>
                  <button onClick={() => toggleCollapse(col.key)} title="Minimize this stage" className="grid h-5 w-5 place-items-center rounded text-[11px] font-extrabold text-slate-400 hover:bg-white/70 hover:text-slate-600">‹</button>
                </span>
              </div>
              {(sums[col.key] ?? 0) > 0 && (
                <div className="mb-1.5 px-1 text-[9px] font-bold text-slate-400" title="Total value in this stage · weighted by how likely this stage is to close">
                  ${Math.round(sums[col.key]).toLocaleString()} · wtd ${Math.round((sums[col.key] ?? 0) * (STAGE_PROB[col.key] ?? 0)).toLocaleString()}
                </div>
              )}
              <div className="max-h-[calc(100vh-290px)] overflow-y-auto overscroll-contain pr-0.5 space-y-1.5">
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
                    style={c.apptDueToday ? { border: "2px solid #ef4444" } : c.taskDueToday ? { border: "2px solid #22c55e" } : c.followUpDue ? { border: "2px solid #3b82f6" } : ageColor(c) ? { border: `2px solid ${ageColor(c)}` } : undefined}
                    className={`cursor-pointer rounded-xl p-3.5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:ring-slate-300 active:cursor-grabbing ${c.apptDueToday ? "bg-red-50/60" : c.taskDueToday ? "bg-emerald-50/50" : c.followUpDue ? "bg-blue-50/50" : "bg-white"} ${dragId === c.id ? "opacity-50" : ""} ${selecting && selected.has(c.id) ? "ring-2 ring-indigo-500" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      {selecting && <input type="checkbox" readOnly checked={selected.has(c.id)} className="mr-1 mt-0.5 h-4 w-4 shrink-0 accent-indigo-600" />}
                      {/* name → FULL card page; anywhere else on the card → quick view.
                          Seller name first, then the 📍 address below (Jon 2026-10-26). On dispo
                          deals (addressFirst) the seller gets a ⭐ so it's distinct from the 👤
                          lead-owner line. */}
                      <a href={`/crm/${c.id}`} onClick={(e) => e.stopPropagation()} title="Open the full lead page" className="text-[14px] font-bold leading-snug text-slate-800 hover:text-indigo-600 hover:underline">{addressFirst ? "⭐ " : ""}{titleCase(c.contactName)}</a>
                      <div className="flex shrink-0 items-center gap-1">
                        {c.gate && <span title={`SOP gate — ${c.gate.label}: ${c.gate.cleared ? "cleared, clear to advance" : "held, advance locked"}`} className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 ${c.gate.cleared ? "bg-emerald-100 text-emerald-700 ring-emerald-200" : "bg-red-100 text-red-700 ring-red-200"}`}>{c.gate.cleared ? "✓ gate" : "🔒 gate"}</span>}
                        {!!c.parcels && c.parcels > 1 && <span title={`${c.parcels} parcels on this deal`} className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 ring-1 ring-amber-200">📦 {c.parcels}</span>}
                        {c.acres != null && <span title={`${c.acres} acres`} className="rounded-full bg-lime-100 px-1.5 py-0.5 text-[9px] font-bold text-lime-800 ring-1 ring-lime-200">⛰️ {c.acres % 1 === 0 ? c.acres : c.acres.toFixed(2)} ac</span>}
                        {c.offers && c.offers.live > 0 && <span title={`${c.offers.live} of ${c.offers.goal} offers received`} className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 ${c.offers.live >= c.offers.goal ? "bg-emerald-100 text-emerald-700 ring-emerald-200" : "bg-amber-100 text-amber-700 ring-amber-200"}`}>💰 {c.offers.live}/{c.offers.goal}</span>}
                        {c.staleStage && <span title={`This deal's saved stage ("${c.staleStage}") no longer exists in this pipeline after a rename — use "Re-sort deals" to file it correctly.`} className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold text-orange-700 ring-1 ring-orange-200">⚠️ was: {c.staleStage}</span>}
                        {c.leadType && <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 ${c.leadType.cls}`}>{c.leadType.label}</span>}
                        {c.waterfront && <span title="Waterfront land — market these first (wealthy buyers keep building through rate hikes)" className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[9px] font-bold text-cyan-700 ring-1 ring-cyan-200">🌊 Waterfront</span>}
                        {c.builderSize && (() => { const m = builderSizeMeta(c.builderSize); return (
                          <button type="button" title={m.title} onClick={(e) => { e.stopPropagation(); flipBuilderSize(c.id, c.builderSize === "big" ? "mompop" : "big"); }} className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 ${m.cls} hover:opacity-80`}>{m.emoji} {m.label}</button>
                        ); })()}
                      </div>
                    </div>
                    {/* property line — opp title only when it's NOT just the name (Jon
                        2026-10-13: name was showing twice, incl. near-dups like
                        "Theil/Phill Torrence"); for land with no address show the APN. */}
                    {(() => {
                      const norm = (x: string) => (x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                      const nName = norm(c.contactName);
                      // rendered through formatAddress so even an old doubled
                      // "…, TX 75069, McKinney, TX, 75069" title reads clean (2026-10-19)
                      const t = formatAddress(c.title ?? "");
                      const nTitle = norm(t);
                      const titleIsName = !!nTitle && !!nName && (nTitle === nName || nTitle.includes(nName) || nName.includes(nTitle));
                      const addr = formatAddress(c.address ?? "");
                      const blur = privacy ? "select-none blur-[3px]" : "";
                      // Show ONE address only (Jon 2026-10-16: imported leads showed
                      // both the opp title AND the contact address). If the title is
                      // itself an address, that's the property line; otherwise fall
                      // back to the 📍 contact address. Never both.
                      const titleIsAddress = show.title && !!t && !titleIsName;
                      // Address + phone are the two things reps act on — make them
                      // big and colored so they pop off the card (Jon 2026-10-20).
                      return (<>
                        {titleIsAddress && <div className={`truncate text-[13px] font-semibold text-brand-navy ${blur}`}>📍 {t}</div>}
                        {!titleIsAddress && addr && <div className={`truncate text-[13px] font-semibold text-brand-navy ${blur}`}>📍 {addr}</div>}
                        {!titleIsAddress && !addr && titleIsName && c.apn && <div className={`truncate text-[12px] font-semibold text-brand-navy ${blur}`}>🧭 APN {c.apn}</div>}
                      </>);
                    })()}
                    {c.phone && <div className={`text-[13px] font-bold text-emerald-600 ${privacy ? "select-none blur-[3px]" : ""}`}>📞 {c.phone}</div>}
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {show.money && c.money && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">{c.money}</span>}
                      {/* 🕒 how long this lead has been sitting in the system — keep
                          leads moving (Jon 2026-10-13): green <7d, amber <30d, red 30d+ */}
                      {c.createdAt && (() => {
                        const d = Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 86400_000);
                        const cls = d >= 30 ? "bg-red-50 text-red-700" : d >= 7 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700";
                        const txt = d <= 0 ? "today" : `${d}d in system`;
                        return <span title={`In the system ${d} day${d === 1 ? "" : "s"} — keep it moving`} className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${cls}`}>🕒 {txt}</span>;
                      })()}
                      {/* ✋ Last-touched (Jon 2026-10-27: "when's the last time anyone actually did
                          something on this lead") — the real activity signal, from notes/calls/texts/
                          emails/tasks, NOT updatedAt. ⚠️ never = nobody has worked it since import. */}
                      {(() => {
                        if (!c.lastTouch) return <span title="No note, call, text, email or task has ever been logged on this lead" className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-red-100 text-red-700">⚠️ never touched</span>;
                        const d = Math.floor((Date.now() - new Date(c.lastTouch).getTime()) / 86400_000);
                        const cls = d >= 7 ? "bg-red-50 text-red-700" : d >= 3 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600";
                        return <span title={`Last worked ${d} day${d === 1 ? "" : "s"} ago (note / call / text / email / task)`} className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${cls}`}>✋ {d <= 0 ? "touched today" : `touched ${d}d ago`}</span>;
                      })()}
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
                      {canCall && c.phone && (
                        <button
                          type="button"
                          title={`Call ${c.contactName} from the browser (Telnyx)`}
                          onClick={() => window.dispatchEvent(new CustomEvent("fo-call", { detail: { phone: c.phone, name: c.contactName, oppId: c.id, contactId: c.contactId } }))}
                          className="grid h-7 w-7 place-items-center rounded-md bg-emerald-50 text-[12px] ring-1 ring-emerald-200 hover:bg-emerald-100"
                        >📞</button>
                      )}
                      {canSms && c.phone && (
                        <button type="button" title={c.smsUnread ? `${c.smsUnread} unread text${c.smsUnread > 1 ? "s" : ""} — open the thread` : "Text via our Telnyx number"} onClick={() => window.dispatchEvent(new CustomEvent("fo-quickview", { detail: { id: c.id, tab: "sms" } }))} className="relative grid h-7 w-7 place-items-center rounded-md bg-sky-50 text-[12px] ring-1 ring-sky-200 hover:bg-sky-100">💬
                          {!!c.smsUnread && <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-0.5 text-[8px] font-extrabold text-white">{c.smsUnread}</span>}
                        </button>
                      )}
                      <button type="button" title="Add a task" onClick={() => window.dispatchEvent(new CustomEvent("fo-quickview", { detail: { id: c.id, tab: "tasks" } }))} className="grid h-7 w-7 place-items-center rounded-md bg-slate-50 text-[12px] ring-1 ring-slate-200 hover:bg-slate-100">✅</button>
                      <button type="button" title="Book an appointment" onClick={() => window.dispatchEvent(new CustomEvent("fo-quickview", { detail: { id: c.id, tab: "appts" } }))} className="grid h-7 w-7 place-items-center rounded-md bg-slate-50 text-[12px] ring-1 ring-slate-200 hover:bg-slate-100">📅</button>
                      <button type="button" title="Add a tag" onClick={() => window.dispatchEvent(new CustomEvent("fo-quickview", { detail: { id: c.id, tab: "opp" } }))} className="grid h-7 w-7 place-items-center rounded-md bg-slate-50 text-[12px] ring-1 ring-slate-200 hover:bg-slate-100">🏷</button>
                      
                      {c.email && <button type="button" title={`Email ${c.contactName} (${c.email})`} onClick={() => window.dispatchEvent(new CustomEvent("fo-quickview", { detail: { id: c.id, tab: "email" } }))} className="grid h-7 w-7 place-items-center rounded-md bg-amber-50 text-[12px] ring-1 ring-amber-200 hover:bg-amber-100">✉️</button>}
                      <button type="button" title="Add a note (opens the full note editor)" onClick={() => window.dispatchEvent(new CustomEvent("fo-quickview", { detail: { id: c.id, tab: "notes" } }))} className="grid h-7 w-7 place-items-center rounded-md bg-violet-50 text-[12px] ring-1 ring-violet-200 hover:bg-violet-100">📝</button>
                      {quick?.id === c.id && (
                        <span className="absolute left-0 top-9 z-30 flex w-60 flex-col gap-1.5 rounded-xl bg-white p-2.5 shadow-xl ring-1 ring-slate-200">
                          {quick.kind === "task" && (<>
                            <input autoFocus value={qa.title} onChange={(e) => setQa({ ...qa, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submitQuick()} placeholder="Task…" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                            <div className="flex gap-1.5">
                              <input type="date" value={qa.due} onChange={(e) => setQa({ ...qa, due: e.target.value })} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                              <input type="time" value={qa.dueTime} onChange={(e) => setQa({ ...qa, dueTime: e.target.value })} title="Time (optional) — drives the reminder" className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                            </div>
                            {reps.length > 0 && <select value={qa.assignee} onChange={(e) => setQa({ ...qa, assignee: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"><option value="">Assign to… (me)</option>{reps.map((r) => <option key={r} value={r}>{r.split(" ")[0]}</option>)}</select>}
                          </>)}
                          {quick.kind === "appt" && (<>
                            <input autoFocus value={qa.title} onChange={(e) => setQa({ ...qa, title: e.target.value })} placeholder="Appointment…" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                            <input type="datetime-local" value={qa.when} onChange={(e) => setQa({ ...qa, when: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                            {reps.length > 0 && <select value={qa.assignee} onChange={(e) => setQa({ ...qa, assignee: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"><option value="">Assign to… (me)</option>{reps.map((r) => <option key={r} value={r}>{r.split(" ")[0]}</option>)}</select>}
                          </>)}
                          {quick.kind === "note" && (
                            <textarea autoFocus value={qa.note} onChange={(e) => setQa({ ...qa, note: e.target.value })} rows={3} placeholder="Note… (saves to the timeline)" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                          )}
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
                    {/* 📅 bottom-right stacked footer (Jon 2026-10-20): in sequence —
                        entered date, then next task due (green), then next appointment
                        due (red). All right-aligned so the left side stays clear. */}
                    {(c.createdAt || c.nextTask || c.nextAppt) && (
                      <div className="mt-1.5 flex flex-col items-end gap-1">
                        {c.createdAt && <div className="text-[9px] font-medium text-slate-400">📅 Entered {new Date(c.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</div>}
                        {c.nextTask && <span title="Next task due" className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-100">✅ Task {new Date(`${c.nextTask}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}</span>}
                        {c.nextAppt && <span title="Next appointment" className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-100">📅 Appt {new Date(c.nextAppt).toLocaleDateString([], { month: "short", day: "numeric" })} · {new Date(c.nextAppt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
                      </div>
                    )}
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
        // 📌 Fixed, always-fully-visible bulk bar (Jon 2026-10-13: the old sticky
        // bar was cut off at the screen bottom so the action controls were
        // unreachable). Two rows so nothing clips; selects open upward near the
        // viewport bottom.
        <div className="fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4">
          <div className="w-full max-w-4xl rounded-2xl bg-slate-900 px-4 py-3 text-xs text-white shadow-2xl ring-1 ring-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold">{stageScope ? <span className="rounded-full bg-indigo-500/30 px-2 py-0.5 text-indigo-200">whole stage · {stageScope.count.toLocaleString()} leads</span> : `${selected.size} selected`}</span>
              {!stageScope && <button onClick={() => { setStageScope(null); setSelected(new Set(cards.map((c) => c.id))); }} className="rounded bg-white/10 px-2 py-1 font-bold hover:bg-white/20">Select all visible</button>}
              <button onClick={() => { setSelecting(false); setSelected(new Set()); setStageScope(null); }} className="ml-auto rounded bg-white/10 px-2 py-1 font-bold hover:bg-white/20">✕ Cancel</button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Do this:</span>
              <select value={bulk.op} onChange={(e) => setBulk({ op: e.target.value, val: "", val2: "" })} className="rounded-lg bg-white px-2 py-1.5 text-xs font-bold text-slate-800">
                <option value="stage">→ Move to stage</option>
                <option value="pipeline">📂 Move to pipeline</option>
                <option value="assign">👤 Change owner</option>
                <option value="follower">👥 Add follower</option>
                <option value="tag">🏷 Add tag</option>
                <option value="untag">🏷 Remove tag</option>
                <option value="delete">🗑 Delete (archive)</option>
              </select>
              {bulk.op === "stage" && (
                <select value={bulk.val} onChange={(e) => setBulk({ ...bulk, val: e.target.value })} className="rounded-lg bg-white px-2 py-1.5 text-xs text-slate-800">
                  <option value="">pick a stage…</option>
                  {columns.map((cc) => <option key={cc.key} value={cc.key}>{cc.label}</option>)}
                </select>
              )}
              {bulk.op === "pipeline" && (<>
                <select value={bulk.val} onChange={(e) => setBulk({ ...bulk, val: e.target.value, val2: "" })} className="rounded-lg bg-white px-2 py-1.5 text-xs text-slate-800">
                  <option value="">pick a pipeline…</option>
                  {Object.keys(pipelineGroups).length ? (<>
                    <optgroup label="📞 Acquisitions">
                      {pipelineNames.filter((pn) => pipelineGroups[pn] !== "dispositions").map((pn) => <option key={pn} value={pn}>{pn}</option>)}
                    </optgroup>
                    <optgroup label="🎯 Dispositions">
                      {pipelineNames.filter((pn) => pipelineGroups[pn] === "dispositions").map((pn) => <option key={pn} value={pn}>{pn}</option>)}
                    </optgroup>
                  </>) : pipelineNames.map((pn) => <option key={pn} value={pn}>{pn}</option>)}
                </select>
                {/* and WHICH stage in that pipeline (Jon 2026-10-13); blank = first stage */}
                {bulk.val && (pipelineStages[bulk.val]?.length ?? 0) > 0 && (
                  <select value={bulk.val2} onChange={(e) => setBulk({ ...bulk, val2: e.target.value })} className="rounded-lg bg-white px-2 py-1.5 text-xs text-slate-800">
                    <option value="">→ first stage</option>
                    {(pipelineStages[bulk.val] ?? []).map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
                  </select>
                )}
              </>)}
              {(bulk.op === "assign" || bulk.op === "follower") && (
                <select value={bulk.val} onChange={(e) => setBulk({ ...bulk, val: e.target.value })} className="rounded-lg bg-white px-2 py-1.5 text-xs text-slate-800">
                  <option value="">pick a person…</option>
                  {reps.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
              {(bulk.op === "tag" || bulk.op === "untag") && <input value={bulk.val} onChange={(e) => setBulk({ ...bulk, val: e.target.value })} placeholder="type a tag…" className="rounded-lg bg-white px-2 py-1.5 text-xs text-slate-800" />}
              {bulk.op === "delete" && <span className="text-[11px] font-bold text-red-300">archives the leads (recoverable)</span>}
              <button onClick={runBulk} disabled={pending || (!stageScope && !selected.size) || (bulk.op !== "delete" && !bulk.val)} className={`ml-auto rounded-lg px-4 py-1.5 font-extrabold text-white disabled:opacity-40 ${bulk.op === "delete" ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600"}`}>{pending ? "Applying…" : `Apply to ${stageScope ? stageScope.count.toLocaleString() : selected.size}`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
