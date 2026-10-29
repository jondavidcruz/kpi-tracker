"use client";
// GHL-style edit panel: click a card → tabbed editor slides in over the board
// (left section nav like GHL's opportunity modal). Everything is editable
// here — details, contact, discovery forms, tasks, appointments, notes —
// without opening the full card page.
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  setOppStageAction, setOppPipelineAction, addCrmNoteAction, saveOppMetaAction, saveCrmContactAction,
  addCrmTaskAction, toggleCrmTaskAction, reassignTaskAction, addCrmApptAction, deleteCrmApptAction,
  setOppOwnerAction, toggleFollowerAction, archiveOppAction, editCrmNoteAction, deleteCrmNoteAction,
  addOpportunityAction,
} from "@/app/crm/actions";
import { KIND_EMOJI, rowIcon, stripAgentNotesBlock, recStreamSrc, sortPipesAqThenDs, readParcels, splitCrammedParcels } from "@/lib/crm-shared";
import ParcelsPanel from "@/components/ParcelsPanel";
import AutoSaveForm from "@/components/AutoSaveForm";
import PhoneField from "@/components/PhoneField";
import CrmFormFields from "@/components/CrmFormFields";
import DispoGatePanel from "@/components/DispoGatePanel";
import { isDispoDealPipeline } from "@/lib/dispo-buyers";
import { readGateChecks } from "@/lib/dispo-gates";
import { readMarketingDone } from "@/lib/dispo-marketing";
import { readDealHeat } from "@/lib/deal-heat";
import DealHeatChip from "@/components/DealHeatChip";
import { readListingHistory } from "@/lib/listing-history";
import ListingHistoryPanel from "@/components/ListingHistoryPanel";
import { formatAddress } from "@/lib/address";
import { formsForPipeline, buildForms } from "@/lib/crm-forms";
import SmsComposer from "@/components/SmsComposer";
import GmailComposer from "@/components/GmailComposer";
import LienBuilder from "@/components/LienBuilder";
import NoteComposer from "@/components/NoteComposer";
import TimelineFilter from "@/components/TimelineFilter";
import DetailsAutofill from "@/components/DetailsAutofill";
import DocUploadForm from "@/components/DocUploadForm";
import DripControl from "@/components/DripControl";
import DispoBuyerTracker from "@/components/DispoBuyerTracker";
import DispoOffersPanel from "@/components/DispoOffersPanel";
import { readDispoBuyers } from "@/lib/dispo-buyers";
import { readDispoOffers } from "@/lib/dispo-offers";
import { uploadLeadFile } from "@/lib/upload-lead-file";
import { sanitizeNoteHtml, isHtmlNote } from "@/lib/note-html";

type Payload = {
  id: string; title: string; stage: string; pipeline: string; pipelines?: string[]; assignedTo: string; tags: string;
  nextFollowUp: string; value: number | null; askPrice: number | null;
  formData: Record<string, Record<string, string | string[]>>;
  customFields?: import("@/lib/crm-forms").CustomFieldMap;
  fieldOverrides?: import("@/lib/crm-forms").FieldOverrideMap;
  driveFiles?: Array<{ id: string; name: string; link: string; mimeType: string }>;
  siblingOpps?: Array<{ id: string; title: string; stage: string; pipeline: string }>;
  me: { name: string; fromLabel: string; signature: string; sigImageUrl?: string; canSms: boolean; canEmail: boolean; canCall: boolean };
  followers: string[];
  reps: string[];
  snippets: Array<{ id: string; name: string; kind: string; subject?: string; body: string }>;
  smsHistory: Array<{ body: string; inbound: boolean; at: string }>;
  emailHistory: Array<{ body: string; inbound: boolean; at: string; actor?: string }>;
  underwrites: Array<{ tab: string; mao: number; fee: number; confidence: number; by: string; at: string }>;
  offers?: Array<{ at: string; from: string; amount: number; subject: string }>;
  contact: { id: string; name: string; phone: string; altPhone: string; email: string; altEmail: string; address: string; pinnedNote: string; tags: string };
  tasks: Array<{ id: string; title: string; due: string; assignedTo: string; doneAt: string | null; doneBy: string }>;
  appts: Array<{ id: string; title: string; at: string; withWho: string }>;
  events: Array<{ id?: string; kind: string; body: string; actor: string; at: string; link?: string; fileName?: string; recLink?: string; transcript?: string }>;
};

// Nav tabs are built per-lead from its pipeline's forms (see tabsFor).
const tabsFor = (pipeline: string | null | undefined) => [
  { key: "opp", label: "Opportunity details", emoji: "📁" },
  { key: "contact", label: "Contact info", emoji: "👤" },
  ...formsForPipeline(pipeline).map((f) => ({ key: `form:${f.key}`, label: f.name, emoji: f.emoji })),
  { key: "listing", label: "Listing history", emoji: "📈" },
  { key: "buyers", label: "Buyers & Offers", emoji: "🤝" },
  { key: "files", label: "Files & docs", emoji: "📎" },
  { key: "tasks", label: "Tasks", emoji: "✅" },
  { key: "appts", label: "Appointments", emoji: "📅" },
  { key: "sms", label: "Text message", emoji: "💬" },
  { key: "email", label: "Email", emoji: "✉️" },
  { key: "notes", label: "Notes & activity", emoji: "📝" },
];

// 🔀 Pipeline ordering (War Room → AQ → DS → rest) lives in crm-shared (sortPipesAqThenDs).
const sortPipes = sortPipesAqThenDs;

// 🔀 Apply the viewer's saved tab order (Jon 2026-10-28: "let me reorder the quick-view
// tabs"). Stored keys come first in their saved order; any tab not in the saved order
// (e.g. a new form) keeps its default position after them.
const TAB_ORDER_KEY = "fo_qv_tab_order";
function applyTabOrder<T extends { key: string }>(tabs: T[], order: string[]): T[] {
  if (!order.length) return tabs;
  const pos = (k: string) => { const i = order.indexOf(k); return i < 0 ? 1000 + tabs.findIndex((t) => t.key === k) : i; };
  return [...tabs].sort((a, b) => pos(a.key) - pos(b.key));
}

// 🎨 Per-section colors (Jon 2026-10-29: "make it visual — Home brown, Land green…" so the
// team knows what section they're on at a glance). `active` colors the nav tab when selected,
// `dot` is the little color marker on every tab, `tint` softly tints that section's content.
const SECTION_META: Record<string, { tint: string; active: string; dot: string }> = {
  "form:property": { tint: "bg-amber-50/60", active: "bg-amber-700 text-white", dot: "bg-amber-700" },   // 🏡 Home = brown
  "form:land": { tint: "bg-green-50/70", active: "bg-green-700 text-white", dot: "bg-green-600" },        // 🏞 Land = green
  "form:financial": { tint: "bg-yellow-50/70", active: "bg-yellow-600 text-white", dot: "bg-yellow-500" },// 💰 Financials = gold
  "form:closing": { tint: "bg-violet-50/70", active: "bg-violet-700 text-white", dot: "bg-violet-600" },  // 📝 Closing = purple
  listing: { tint: "bg-teal-50/70", active: "bg-teal-700 text-white", dot: "bg-teal-600" },               // 📈 Listing history = teal
  buyers: { tint: "bg-orange-50/70", active: "bg-orange-600 text-white", dot: "bg-orange-500" },          // 🤝 Buyers = orange
  files: { tint: "bg-sky-50/70", active: "bg-sky-700 text-white", dot: "bg-sky-600" },                    // 📎 Files = sky
  contact: { tint: "bg-rose-50/60", active: "bg-rose-600 text-white", dot: "bg-rose-500" },               // 👤 Contact = rose
  tasks: { tint: "bg-emerald-50/60", active: "bg-emerald-600 text-white", dot: "bg-emerald-500" },        // ✅ Tasks = emerald
  appts: { tint: "bg-pink-50/60", active: "bg-pink-600 text-white", dot: "bg-pink-500" },                 // 📅 Appts = pink
  sms: { tint: "bg-blue-50/60", active: "bg-blue-600 text-white", dot: "bg-blue-500" },                   // 💬 SMS = blue
  email: { tint: "bg-red-50/50", active: "bg-red-700 text-white", dot: "bg-red-600" },                    // ✉️ Email = red
  notes: { tint: "bg-amber-50/50", active: "bg-amber-500 text-white", dot: "bg-amber-400" },              // 📝 Notes = yellow
};
const sectionMeta = (k: string) => SECTION_META[k] ?? { tint: "", active: "bg-brand-navy text-white", dot: "bg-slate-400" };

const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm";
const labelCls = "mb-0.5 block text-[11px] font-bold text-slate-500";

export default function CrmQuickView({ stages, pipelineStages, marketingSteps = [] }: { stages: Array<{ key: string; label: string }>; pipelineStages?: Record<string, Array<{ key: string; label: string }>>; marketingSteps?: import("@/lib/dispo-marketing").MarketingStep[] }) {
  const [oppId, setOppId] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState("opp");
  const [saved, setSaved] = useState("");
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [navMin, setNavMin] = useState(false);
  const [lienOpen, setLienOpen] = useState(false);
  const [pending, start] = useTransition();
  // 🔀 Drag-to-reorder the left-nav tabs, saved on this device (Jon 2026-10-28).
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const dragTabRef = useRef<string | null>(null);
  const [dragTab, setDragTab] = useState<string | null>(null);
  useEffect(() => { try { const s = localStorage.getItem(TAB_ORDER_KEY); if (s) setTabOrder(JSON.parse(s)); } catch { /* none */ } }, []);
  const reorderTabs = (displayKeys: string[], targetKey: string) => {
    const from = dragTabRef.current; dragTabRef.current = null; setDragTab(null);
    if (!from || from === targetKey) return;
    const keys = [...displayKeys];
    const fi = keys.indexOf(from); if (fi < 0) return;
    keys.splice(fi, 1);
    const ti = keys.indexOf(targetKey);
    keys.splice(ti < 0 ? keys.length : ti, 0, from); // drop before the target
    setTabOrder(keys);
    try { localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(keys)); } catch { /* ignore */ }
  };

  useEffect(() => {
    const h = (e: Event) => { const d2 = (e as CustomEvent).detail as { id?: string; tab?: string }; if (d2?.id) { setOppId(d2.id); setData(null); setTab(d2.tab || "opp"); setSaved(""); } };
    window.addEventListener("fo-quickview", h);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOppId(null); };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("fo-quickview", h); window.removeEventListener("keydown", esc); };
  }, []);

  const refetch = async (id: string) => { const r = await fetch(`/api/crm/opp/${id}`); if (r.ok) setData(await r.json()); };
  useEffect(() => { if (oppId) refetch(oppId); }, [oppId]);

  if (!oppId) return null;
  const d = data;
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local — for overdue-task flagging
  const submit = (action: (fd: FormData) => Promise<unknown>, extra?: Record<string, string>) => (fd: FormData) => {
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    start(async () => { await action(fd); setSaved("✓ Saved"); setTimeout(() => setSaved(""), 2000); if (oppId) await refetch(oppId); });
  };

  const lienLegal = String(
    (d?.formData?.land as Record<string, string> | undefined)?.legalDescription ??
    (d?.formData?.property as Record<string, string> | undefined)?.legal ??
    (d?.formData?.property as Record<string, string> | undefined)?.apn ?? "",
  );
  // Signed agreements on this lead = file-kind timeline events (uploads + PandaDoc).
  const lienDocs = (d?.events ?? [])
    .filter((e) => e.kind === "file")
    .map((e) => {
      const m = (e.body || "").match(/https?:\/\/\S+/);
      const label = (e.body || "").replace(/https?:\/\/\S+/g, "").replace(/[📎🔗]+/g, "").replace(/[\s·—–-]+$/, "").trim() || "Document";
      return { label: label.slice(0, 80), url: m ? m[0] : "" };
    })
    .filter((x) => x.url);

  return (
    <>
      {d && lienOpen && (
        <LienBuilder open={lienOpen} onClose={() => setLienOpen(false)}
          seller={d.contact.name} property={d.contact.address || d.title} legal={lienLegal} contractDate=""
          signer={d.me.name} events={d.events} documents={lienDocs} />
      )}
      <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setOppId(null)} />
      <div className="fixed inset-x-0 top-[4vh] z-50 mx-auto flex h-[88vh] w-[min(60rem,95vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {!d ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading…</div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-extrabold tracking-tight text-slate-900">Edit “{d.contact.name}”</div>
                {/* 📍 Property address always under the name so you know what deal you're on,
                    on every tab (Jon 2026-10-29: "I want it always at the top"). */}
                {(formatAddress(d.title) || d.contact.address) && (
                  <div className="truncate text-[12.5px] font-semibold text-slate-600" title={formatAddress(d.title) || d.contact.address}>📍 {formatAddress(d.title) || d.contact.address}</div>
                )}
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <span className="font-semibold text-slate-400">Pipeline:</span>
                  <PipelineMover d={d} pipelineStages={pipelineStages} setSaved={setSaved} />
                  {/* 🔥 spread rating — same control as the board card (Jon 2026-10-29) */}
                  <DealHeatChip oppId={d.id} heat={readDealHeat(d.formData)} />
                </div>
              </div>
              {saved && <span className="text-xs font-bold text-emerald-600">{saved}</span>}
              {pending && <span className="text-xs text-slate-400">saving…</span>}
              {d.contact.phone && d.me.canCall && (
                <button onClick={() => window.dispatchEvent(new CustomEvent("fo-call", { detail: { phone: d.contact.phone, name: d.contact.name, oppId: d.id, contactId: d.contact.id } }))} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">📞 Call</button>
              )}
              {/* 📄 Buyer-safe details export, right in the quick-view (Jon 2026-10-27:
                  Marie builds the offer packet from here, not just the full page). */}
              <a href={`/crm/${d.id}/details-sheet`} target="_blank" rel="noopener noreferrer" title="Open a clean, buyer-safe PDF of the property/land details — seller info left out" className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100">📄 Export Buyer Packet</a>
              <a href={`/crm/${d.id}`} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">Open full ↗</a>
              <button
                title="Delete this lead (goes to the archive — recoverable, never truly gone)"
                onClick={() => {
                  if (!confirm(`Delete ${d.contact.name}? It moves to the archive (recoverable) — it is NOT permanently destroyed.`)) return;
                  const fd = new FormData(); fd.set("id", d.id);
                  start(async () => { await archiveOppAction(fd); setOppId(null); window.location.reload(); });
                }}
                className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-400 ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600 hover:ring-red-200"
              >🗑 Delete</button>
              <button onClick={() => setOppId(null)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
            </div>

            {/* Salesforce-style path — same one as the full card */}
            <div className="flex gap-[3px] overflow-x-auto border-b border-slate-100 px-5 py-2">
              {stages.map((s, i) => {
                const curIdx = stages.findIndex((x) => x.key === d.stage);
                const done = i < curIdx, current = i === curIdx;
                return (
                  <button
                    key={s.key}
                    disabled={current || pending}
                    title={current ? `Current: ${s.label}` : `Move to ${s.label}`}
                    onClick={() => { setData({ ...d, stage: s.key }); const fd = new FormData(); fd.set("id", d.id); fd.set("stage", s.key); start(async () => { await setOppStageAction(fd); }); }}
                    className={`min-w-[80px] flex-1 truncate px-2 py-1 text-center text-[9px] font-bold transition first:rounded-l-full last:rounded-r-full ${
                      current ? "bg-brand-navy text-white" : done ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                    style={{ clipPath: i === stages.length - 1 ? undefined : "polygon(0 0, calc(100% - 7px) 0, 100% 50%, calc(100% - 7px) 100%, 0 100%, 7px 50%)" }}
                  >{s.label}</button>
                );
              })}
            </div>

            {/* 🚦 Option B — SOP gate for dispo deals; advance is locked until it clears
                (Jon 2026-10-21). Uses the board's own `stages` (the open deal's pipeline)
                rather than a name-keyed lookup, which broke on aliased pipeline names. */}
            {/* 🚦 Gate is now collapsible + closed by default (Jon 2026-10-26: it took up too
                much of the modal and squeezed the notes). The cascade runs automatically, so its
                manual button is gone from here too. */}
            {isDispoDealPipeline(d.pipeline) && (pipelineStages?.[d.pipeline] ?? stages).length > 0 && (
              <details className="border-b border-slate-100 px-5 py-2">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] font-bold text-slate-600 [&::-webkit-details-marker]:hidden">
                  🚦 SOP gate <span className="font-normal text-slate-400">— open to work the stage checklist</span>
                  <span className="ml-auto text-slate-300">▸</span>
                </summary>
                <div className="pt-2">
                  <DispoGatePanel oppId={d.id} pipeline={d.pipeline} currentStage={d.stage} stages={pipelineStages?.[d.pipeline] ?? stages} checks={readGateChecks(d.formData)} onChanged={() => refetch(d.id)} marketingSteps={marketingSteps} marketingDone={readMarketingDone(d.formData)} />
                </div>
              </details>
            )}

            <div className="flex min-h-0 flex-1">
              {/* left section nav, GHL-style — collapsible to an icon rail (Jon
                  2026-10-13: "minimize like on a MacBook") for small/iPad screens */}
              <nav className={`${navMin ? "w-11" : "w-48"} shrink-0 space-y-0.5 overflow-y-auto border-r border-slate-100 bg-slate-50/60 p-2 transition-all`}>
                <button onClick={() => setNavMin((v) => !v)} title={navMin ? "Expand menu" : "Minimize menu"} className="mb-1 block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-slate-400 hover:bg-slate-100">
                  {navMin ? "»" : "« minimize"}
                </button>
                {(() => {
                  const displayTabs = applyTabOrder(tabsFor(d.pipeline), tabOrder);
                  const keys = displayTabs.map((t) => t.key);
                  return displayTabs.map((t) => (
                    <button key={t.key} onClick={() => setTab(t.key)} title={`${t.label} — drag to reorder`}
                      draggable
                      onDragStart={() => { dragTabRef.current = t.key; setDragTab(t.key); }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); reorderTabs(keys, t.key); }}
                      onDragEnd={() => { dragTabRef.current = null; setDragTab(null); }}
                      className={`flex w-full items-center gap-1.5 cursor-grab rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold active:cursor-grabbing ${navMin ? "justify-center" : ""} ${dragTab === t.key ? "opacity-40" : ""} ${tab === t.key ? sectionMeta(t.key).active : "text-slate-600 hover:bg-slate-100"}`}>
                      {!navMin && <span className={`h-2 w-2 shrink-0 rounded-full ${tab === t.key ? "bg-white/80" : sectionMeta(t.key).dot}`} />}
                      <span>{t.emoji}{navMin ? "" : ` ${t.label}`}</span>
                    </button>
                  ));
                })()}
              </nav>

              <div className={`min-w-0 flex-1 overflow-y-auto p-5 transition-colors ${sectionMeta(tab).tint}`}>
                {stripAgentNotesBlock(d.contact.pinnedNote) && <div className="mb-3 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">📌 {stripAgentNotesBlock(d.contact.pinnedNote)}</div>}

                {tab === "opp" && (
                  <AutoSaveForm action={submit(saveOppMetaAction, { id: d.id })} className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className={labelCls}>🏠 Property address <span className="font-normal normal-case text-slate-400">— the deal / property (this lead is named after the seller: {d.contact.name})</span></label>
                      <input name="title" defaultValue={formatAddress(d.title)} placeholder="123 Main St, City, ST ZIP" className={inputCls} />
                    </div>
                    {/* 🔗 Parcels + all opportunities for this contact (Jon 2026-10-29: mirror the
                        full view — add individual parcels/APNs instead of cramming four into one
                        address, and show every opportunity on this contact from the card you're on). */}
                    <div className="col-span-2 space-y-3 rounded-xl bg-amber-50/50 p-3 ring-1 ring-amber-100">
                      {(() => {
                        const parcels = readParcels(d.formData);
                        const crammedApn = (d.formData as { property?: { apn?: string } } | undefined)?.property?.apn ?? "";
                        const show = parcels.length > 0 || splitCrammedParcels(d.contact.address, crammedApn).length > 0;
                        return show ? <ParcelsPanel oppId={d.id} parcels={parcels} crammedAddress={d.contact.address} crammedApn={crammedApn} /> : null;
                      })()}
                      <div>
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">🔗 All opportunities for {d.contact.name.split(" ")[0]} ({(d.siblingOpps?.length ?? 0) + 1}) — each is its own card with its own notes</div>
                        <div className="space-y-1">
                          {/* the card we're viewing right now */}
                          <div className="flex items-center gap-2 rounded-lg bg-brand-navy/5 px-2.5 py-1.5 text-xs font-semibold text-brand-navy ring-1 ring-brand-navy/20">
                            <span className="shrink-0 rounded bg-brand-navy px-1 py-0.5 text-[8px] font-bold text-white">● viewing</span>
                            <span className="flex-1 truncate">{d.title || "(untitled)"}</span>
                            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{d.stage}</span>
                          </div>
                          {(d.siblingOpps ?? []).map((o) => (
                            <button key={o.id} type="button" onClick={() => window.dispatchEvent(new CustomEvent("fo-quickview", { detail: { id: o.id } }))} title={`${o.pipeline} · ${o.stage}`} className="flex w-full items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                              <span className="flex-1 truncate text-left">📁 {o.title || "(untitled)"} <span className="font-normal text-slate-400">· {o.pipeline}</span></span>
                              <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{o.stage}</span>
                            </button>
                          ))}
                        </div>
                        {/* add another parcel as its OWN opportunity card — address + APN */}
                        <form action={addOpportunityAction} className="mt-1.5 space-y-1.5">
                          <input type="hidden" name="contactId" value={d.contact.id} />
                          <input name="title" required placeholder="＋ another property / address (required) …" className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                          <div className="flex gap-1.5">
                            <input name="apn" placeholder="🧭 APN / Parcel # (optional)" className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                            <button className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-bold text-white hover:bg-slate-700">Add</button>
                          </div>
                        </form>
                      </div>
                    </div>
                    <DripControl oppId={d.id} contactId={d.contact.id} drip={(d.formData as Record<string, unknown> | undefined)?.__drip as { seq?: string; step?: number; nextAt?: string } | null} onChanged={() => refetch(d.id)} />
                    <PipelineStage d={d} pipelineStages={pipelineStages} stages={stages} setSaved={setSaved} setData={setData} />

                    <div>
                      <label className={labelCls}>Owner (saves instantly)</label>
                      <select
                        value={d.assignedTo}
                        onChange={(e) => { const owner = e.target.value; setData({ ...d, assignedTo: owner }); const fd = new FormData(); fd.set("id", d.id); fd.set("owner", owner); start(async () => { await setOppOwnerAction(fd); }); }}
                        className={inputCls}
                      >
                        <option value="">Unassigned</option>
                        {d.reps.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <input type="hidden" name="assignedTo" value={d.assignedTo} />
                    </div>
                    <div>
                      <label className={labelCls}>👣 Followers (can see this lead)</label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {d.followers.map((f) => (
                          <button key={f} type="button" title="Remove follower" onClick={() => { const fd = new FormData(); fd.set("id", d.id); fd.set("name", f); fd.set("remove", "1"); start(async () => { await toggleFollowerAction(fd); if (oppId) await refetch(oppId); }); }} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-600 ring-1 ring-indigo-100 hover:bg-red-50 hover:text-red-500">{f.split(" ")[0]} ✕</button>
                        ))}
                        <select value="" onChange={(e) => { const n = e.target.value; if (!n) return; const fd = new FormData(); fd.set("id", d.id); fd.set("name", n); start(async () => { await toggleFollowerAction(fd); if (oppId) await refetch(oppId); }); e.target.value = ""; }} className="rounded-lg border border-slate-200 px-1.5 py-1 text-[11px] font-bold text-slate-500">
                          <option value="">＋ add…</option>
                          {d.reps.filter((r) => r !== d.assignedTo && !d.followers.includes(r)).map((r) => <option key={r} value={r}>{r.split(" ")[0]}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Deal value $</label>
                      <input name="value" defaultValue={d.value ?? ""} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Next follow-up</label>
                      <input name="nextFollowUp" type="datetime-local" defaultValue={(d.formData as Record<string, unknown> | undefined)?.__fuAt as string || (d.nextFollowUp ? `${d.nextFollowUp}T09:00` : "")} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Tags (comma-separated)</label>
                      <input name="tags" defaultValue={d.tags} className={inputCls} />
                    </div>
                  </AutoSaveForm>
                )}

                {tab === "contact" && (
                  <AutoSaveForm action={submit(saveCrmContactAction, { id: d.contact.id, oppId: d.id, ctags: d.contact.tags })} className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className={labelCls}>Name</label>
                      <input name="name" defaultValue={d.contact.name} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Phone</label>
                      <PhoneField name="phone" defaultValue={d.contact.phone} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Phone 2</label>
                      <PhoneField name="altPhone" defaultValue={d.contact.altPhone} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Email</label>
                      <input name="email" defaultValue={d.contact.email} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Email 2</label>
                      <input name="altEmail" defaultValue={d.contact.altEmail} className={inputCls} />
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>📬 Mailing address <span className="font-normal normal-case text-slate-400">— where this person lives (not the property)</span></label>
                      <input name="address" defaultValue={d.contact.address} placeholder="Seller's home / mailing address" className={inputCls} />
                    </div>
                    <div className="col-span-2 text-[10px] text-slate-400">The property address + APN live on <b>Opportunity details</b> and <b>Home / Land Details</b> — this is just the person.</div>
                  </AutoSaveForm>
                )}

                {buildForms(d.pipeline, d.customFields, d.fieldOverrides).map((f) => tab === `form:${f.key}` && (
                  <div key={f.key} className="space-y-3">
                    {f.key === "financial" && <UnderwriteBlock d={d} />}
                    {/* ✨ pull details straight out of the notes (Home/Land only) */}
                    {(f.key === "property" || f.key === "land") && <DetailsAutofill oppId={d.id} formKey={f.key} onApplied={() => refetch(d.id)} />}
                    {/* controlled fields — never blank out the rep's dropdown choices (Jon 2026-10-26) */}
                    <CrmFormFields form={f} oppId={d.id} contactId={d.contact.id} initial={(d.formData?.[f.key] ?? {}) as Record<string, string | string[]>} />
                  </div>
                ))}

                {/* 🤝 Buyers on the deal + offers received — the SAME trackers as the full
                    contact view, read from formData so they stay in sync (Jon 2026-10-28). */}
                {tab === "listing" && (
                  <ListingHistoryPanel oppId={d.id} rows={readListingHistory(d.formData)} address={formatAddress(d.title) || d.contact.address} onSaved={() => refetch(d.id)} />
                )}

                {tab === "buyers" && (
                  <div className="space-y-3">
                    <DispoOffersPanel oppId={d.id} offers={readDispoOffers(d.formData)} buyerNames={readDispoBuyers(d.formData).map((b) => b.name)} askPrice={d.askPrice} />
                    <DispoBuyerTracker oppId={d.id} buyers={readDispoBuyers(d.formData)} today={new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })} canCall={d.me.canCall} canSms={d.me.canSms} board />
                  </div>
                )}

                {/* 📎 Files & docs — upload here (streams to Drive) + every file on this deal,
                    the same documents the full contact view shows (Jon 2026-10-28). */}
                {tab === "files" && (() => {
                  const evFiles = d.events.filter((e) => e.kind === "file" && e.link).map((e) => ({ id: e.id ?? e.link!, name: e.fileName || "Document", link: e.link!, at: e.at }));
                  const seen = new Set(evFiles.map((f) => f.link));
                  const drive = (d.driveFiles ?? []).filter((f) => !seen.has(f.link));
                  const empty = evFiles.length === 0 && drive.length === 0;
                  return (
                    <div className="space-y-3">
                      <DocUploadForm oppId={d.id} contactId={d.contact.id} />
                      {empty && <p className="text-xs text-slate-400">No files on this lead yet — upload one above. It saves to the deal&apos;s Drive folder.</p>}
                      {evFiles.length > 0 && (
                        <div className="space-y-1">
                          {evFiles.map((f) => (
                            <a key={f.id} href={f.link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs text-sky-700 ring-1 ring-slate-100 hover:bg-slate-50">
                              <span className="truncate font-semibold">📎 {f.name}</span>
                              <span className="shrink-0 text-[10px] text-slate-400">{new Date(f.at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                            </a>
                          ))}
                        </div>
                      )}
                      {drive.length > 0 && (
                        <div>
                          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">📁 In the deal&apos;s Drive folder</div>
                          <div className="space-y-1">
                            {drive.map((f) => (
                              <a key={f.id} href={f.link} target="_blank" rel="noopener noreferrer" className="block truncate rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-sky-700 ring-1 ring-slate-100 hover:bg-slate-50">📄 {f.name}</a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {tab === "tasks" && (
                  <div className="space-y-3">
                    {/* Assign tasks to anyone on the team (Jon 2026-10-20), not just
                        yourself — defaults to this lead's owner. */}
                    <form action={submit(addCrmTaskAction, { oppId: d.id, contactId: d.contact.id })} className="flex flex-wrap items-center gap-2">
                      <input name="title" placeholder="New task…" required className="min-w-[140px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm" />
                      <input name="due" type="date" className="w-36 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                      <input name="dueTime" type="time" title="Time (optional) — drives the reminder" className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                      <select name="assignedTo" defaultValue={d.assignedTo} title="Assign to" className="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
                        {[...new Set([d.assignedTo, ...d.reps].filter(Boolean))].map((r) => <option key={r} value={r}>{r.split(" ")[0]}</option>)}
                      </select>
                      <button className="rounded-xl bg-brand-navy px-3 py-1.5 text-xs font-bold text-white">Add</button>
                    </form>
                    {d.tasks.length === 0 && <div className="text-xs text-slate-400">No tasks yet.</div>}
                    {d.tasks.map((t) => {
                      const done = !!t.doneAt;
                      const deleted = t.doneBy.startsWith("🗑");
                      const overdue = !done && t.due && t.due.slice(0, 10) < today;
                      return (
                        <form key={t.id} action={submit(toggleCrmTaskAction, { id: t.id })} className={`flex items-center gap-2 rounded-lg px-3 py-2 ring-1 ${done ? "bg-slate-50/60 ring-slate-100" : overdue ? "bg-rose-50 ring-rose-200" : "bg-slate-50 ring-slate-100"}`}>
                          <button className={`grid h-5 w-5 place-items-center rounded border text-[10px] ${done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent hover:text-emerald-600"}`} title={done ? "Mark not done" : "Mark done"}>✓</button>
                          <div className="min-w-0 flex-1">
                            <span className={`block text-sm ${done ? "text-slate-400 line-through" : "text-slate-700"}`}>{t.title}</span>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold">
                              {/* Reassign the task to anyone (Jon 2026-10-27) — e.g. hand it to Nick. */}
                              {t.assignedTo && (
                                <select value={t.assignedTo} title="Reassign this task" onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => { e.stopPropagation(); const fd = new FormData(); fd.set("id", t.id); fd.set("assignedTo", e.target.value); start(async () => { await reassignTaskAction(fd); setSaved("✓ reassigned"); setTimeout(() => setSaved(""), 1500); if (oppId) await refetch(oppId); }); }}
                                  className="rounded border border-slate-200 bg-white px-1 py-0 text-[10px] font-semibold text-indigo-600">
                                  {[...new Set([t.assignedTo, ...d.reps].filter(Boolean))].map((r) => <option key={r} value={r}>👤 {r.split(" ")[0]}</option>)}
                                </select>
                              )}
                              {t.due && <span className={overdue ? "text-rose-600" : "text-slate-400"}>📅 {t.due.replace("T", " ")}{overdue ? " · overdue" : ""}</span>}
                              {done && !deleted && <span className="text-emerald-600">✓ done {new Date(t.doneAt!).toLocaleDateString([], { month: "short", day: "numeric" })}{t.doneBy ? ` by ${t.doneBy.split(" ")[0]}` : ""}</span>}
                              {deleted && <span className="text-slate-400">{t.doneBy} {new Date(t.doneAt!).toLocaleDateString([], { month: "short", day: "numeric" })}</span>}
                            </div>
                          </div>
                        </form>
                      );
                    })}
                  </div>
                )}

                {tab === "appts" && (
                  <div className="space-y-3">
                    <form action={submit(addCrmApptAction, { oppId: d.id, contactId: d.contact.id })} className="grid grid-cols-2 gap-2">
                      <input name="title" placeholder="Appointment title…" required className={`${inputCls} col-span-2`} />
                      <select name="aptType" className={inputCls}>
                        <option value="phone">📞 Phone apt</option>
                        <option value="inperson">🤝 In person apt</option>
                      </select>
                      <select name="purpose" className={inputCls}>
                        <option value="Process call">Process call</option>
                        <option value="Offer call">Offer call</option>
                        <option value="Negotiation">Negotiation</option>
                        <option value="Follow-up info">Follow-up info</option>
                        <option value="Inspection / photos">Inspection / photos</option>
                        <option value="Contract signing">Contract signing</option>
                        <option value="custom">✏️ Custom…</option>
                      </select>
                      <input name="purposeCustom" placeholder="custom purpose (if ✏️)" className={inputCls} />
                      <input name="at" type="datetime-local" required className={inputCls} />
                      <select name="withWho" defaultValue={d.assignedTo} title="Assign to" className={inputCls}>
                        {[...new Set([d.assignedTo, ...d.reps].filter(Boolean))].map((r) => <option key={r} value={r}>{r.split(" ")[0]}</option>)}
                      </select>
                      <input name="note" placeholder="Note (optional)" className={`${inputCls} col-span-2`} />
                      <div className="col-span-2"><button className="rounded-xl bg-brand-navy px-3 py-1.5 text-xs font-bold text-white">Book appointment</button></div>
                    </form>
                    {d.appts.length === 0 && <div className="text-xs text-slate-400">Nothing booked.</div>}
                    {d.appts.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                        <span className="flex-1 text-sm text-slate-700">📅 {a.title}</span>
                        <span className="text-[11px] font-bold text-slate-500">{new Date(a.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                        <form action={submit(deleteCrmApptAction, { id: a.id })}><button className="text-xs text-slate-400 hover:text-red-500" title="Delete">🗑</button></form>
                      </div>
                    ))}
                  </div>
                )}

                {tab === "sms" && (
                  !d.me.canSms ? <div className="text-xs text-amber-600">Texting isn&apos;t enabled for you — ask Jon (Comms access on /crm).</div>
                  : !d.contact.phone ? <div className="text-xs text-slate-400">No phone number on file.</div>
                  : <SmsComposer compact history={d.smsHistory} oppId={d.id} contactId={d.contact.id} to={d.contact.phone} leadName={d.contact.name} rep={d.me.name} snippets={d.snippets.filter((s) => s.kind === "sms")} />
                )}

                {tab === "email" && (
                  !d.me.canEmail ? <div className="text-xs text-amber-600">Email isn&apos;t enabled for you — ask Jon (Comms access on /crm).</div>
                  : !d.contact.email ? <div className="text-xs text-slate-400">No email on file.</div>
                  : <GmailComposer history={d.emailHistory} oppId={d.id} contactId={d.contact.id} to={d.contact.email} leadName={d.contact.name} rep={d.me.name} fromLabel={d.me.fromLabel} signature={d.me.signature} sigImageUrl={d.me.sigImageUrl} snippets={d.snippets.filter((s) => s.kind === "email")} />
                )}

                {tab === "notes" && (
                  <div className="space-y-3">
                    {/* 🔴 File a Lien — compiles this seller's whole timeline into the
                        recordable Memorandum / Affidavit of Interest (Jon 2026-10-20). */}
                    <div className="flex items-center justify-between rounded-xl bg-red-50 px-3 py-2 ring-1 ring-red-200">
                      <span className="text-[11px] font-semibold text-red-800">Seller signed but won&apos;t close? Compile everything into a recordable lien.</span>
                      <button type="button" onClick={() => setLienOpen(true)} className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-red-700">🔴 File a Lien</button>
                    </div>
                    <NoteComposer onSubmit={(html, file) => {
                      // 📎 File → straight to Drive (no Vercel 4.5MB cap); text-only → fast server action.
                      if (file) {
                        start(async () => {
                          const r = await uploadLeadFile({ oppId: d.id, contactId: d.contact.id, file, asNote: true, body: html });
                          if (!r.ok) alert(r.msg);
                          if (oppId) await refetch(oppId);
                        });
                        return;
                      }
                      const fd = new FormData(); fd.set("body", html); submit(addCrmNoteAction, { oppId: d.id, contactId: d.contact.id })(fd);
                    }} />
                    <TimelineFilter>
                    <div className="space-y-1.5">
                      {d.events.map((e, i) => {
                        const mine = e.kind === "note" && !!e.id && e.actor === d.me.name;
                        if (mine && editNoteId === e.id) return (
                          <form key={e.id} action={submit(editCrmNoteAction, { id: e.id!, oppId: d.id })} onSubmit={() => setEditNoteId(null)} className="rounded-lg bg-white p-2 ring-1 ring-indigo-200">
                            <textarea name="body" defaultValue={e.body} rows={3} className={inputCls} autoFocus />
                            <div className="mt-1 flex gap-1.5">
                              <button className="rounded-lg bg-brand-navy px-3 py-1 text-[11px] font-bold text-white">Save</button>
                              <button type="button" onClick={() => setEditNoteId(null)} className="rounded-lg bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-500">Cancel</button>
                            </div>
                          </form>
                        );
                        // Manual rep notes pop as a yellow sticky-note card; the
                        // automated timeline (stage moves, automations, form updates)
                        // stays plain so the real notes stand out (Jon 2026-10-20).
                        const isNote = e.kind === "note";
                        const isSms = e.kind === "sms"; // 🔵 blue iMessage-style card
                        const isEmail = e.kind === "email"; // 🔴 red Gmail-style card
                        return (
                          <div key={e.id ?? i} data-tlrow data-kind={e.kind} className={`group/qn rounded-lg px-3 py-2 text-xs ring-1 ${isNote ? "border-l-4 border-amber-400 bg-amber-50 text-slate-800 ring-amber-200" : isSms ? "border-l-4 border-sky-400 bg-sky-50 text-slate-800 ring-sky-200" : isEmail ? "border-l-4 border-red-400 bg-red-50 text-slate-800 ring-red-200" : "bg-white text-slate-700 ring-slate-100"}`}>
                            <span className="mr-1">{isNote ? "🟡" : rowIcon(e.kind, e.body)}</span>
                            {isNote && isHtmlNote(e.body)
                              ? <div className="mt-1 text-[13px] leading-relaxed [&_a]:text-indigo-600 [&_a]:underline [&_b]:font-bold [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-bold [&_u]:underline [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(e.body) }} />
                              : <span className={`whitespace-pre-line break-words ${isNote ? "font-medium" : ""}`}>{cleanLinkify(e.body)}</span>}
                            {e.link && <a href={e.link} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()} className="mt-1 inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-sky-700 ring-1 ring-slate-200 hover:bg-slate-50">📎 {e.fileName || "Open document"}</a>}
                            {/* 🎙 call recording — play it + read the transcript right here (Jon 2026-10-22) */}
                            {e.recLink && (
                              <div className="mt-1.5 space-y-1" onClick={(ev) => ev.stopPropagation()}>
                                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                <audio controls preload="none" src={recStreamSrc(e.recLink)} className="h-8 w-full max-w-xs" />
                                {e.transcript && <details className="text-[11px]"><summary className="cursor-pointer font-bold text-slate-400 hover:text-slate-600">📄 Transcript</summary><div className="mt-1 max-h-48 overflow-y-auto whitespace-pre-line rounded-lg bg-slate-50 p-2 text-slate-600 ring-1 ring-slate-100">{e.transcript}</div></details>}
                              </div>
                            )}
                            <span className="ml-1 text-[9px] text-slate-400">{e.actor} · {new Date(e.at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                            {mine && <button onClick={() => { setEditNoteId(e.id!); }} title="Edit this note" className="ml-1.5 text-[10px] font-bold text-slate-300 opacity-0 transition group-hover/qn:opacity-100 hover:text-indigo-600">✎ edit</button>}
                            {mine && <button onClick={() => { if (confirm("Delete this note?")) { const fd = new FormData(); fd.set("id", e.id!); fd.set("oppId", d.id); submit(deleteCrmNoteAction)(fd); } }} title="Delete this note" className="ml-1 text-[10px] font-bold text-slate-300 opacity-0 transition group-hover/qn:opacity-100 hover:text-red-600">🗑</button>}
                          </div>
                        );
                      })}
                    </div>
                    </TimelineFilter>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// 🧮 Financials & Offer: the lead's saved underwriting (matched by address),
// what we offered vs what the seller said, and a negotiation playbook when
// the answer was no (Jon 2026-10-08). All data already in the payload — zero
// extra fetches.
const UW_TABS: Record<string, string> = {
  cash: "💵 Cash", novation: "📝 Novation", creative: "🎨 Creative",
  listing: "🏷 Listing", flip: "🔨 Flip", cash_land: "🏞 Land (Cash)",
  developer: "🚧 Developer", note_land: "📜 Land Note",
};
function UnderwriteBlock({ d }: { d: Payload }) {
  const uw = d.underwrites ?? [];
  const fin = (d.formData?.financial ?? {}) as Record<string, string | string[]>;
  const num = (s: unknown) => parseFloat(String(s ?? "").replace(/[^0-9.]/g, "")) || 0;
  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
  // latest underwrite per exit strategy
  const latest = new Map<string, (typeof uw)[number]>();
  for (const u of uw) if (!latest.has(u.tab)) latest.set(u.tab, u);
  const bestMao = Math.max(0, ...uw.map((u) => u.mao));
  const ourOffer = num(fin.ourOffer);
  const sellerNum = num(fin.sellerNumber) || num((d.formData?.discovery as Record<string, string | string[]> | undefined)?.wants);
  const resp = String(fin.sellerResponse ?? "");
  const rejected = resp.includes("Rejected") || resp.includes("Countered");
  const addr = d.contact.address || d.title;
  // Pass the oppId so an exported cash/novation/assignment offer links straight back
  // to THIS card (Jon 2026-10-20) — not just address-matched.
  const calcHref = `/underwriting?address=${encodeURIComponent(addr)}&opp=${encodeURIComponent(d.id)}`;

  // negotiation playbook (rule-based, uses the real numbers on this lead)
  const tips: string[] = [];
  if (rejected) {
    const gap = sellerNum && ourOffer ? sellerNum - ourOffer : 0;
    if (gap > 0) tips.push(`Gap is ${money(gap)} (they want ${money(sellerNum)}, we offered ${money(ourOffer)}). Reframe to their NET: on the open market they lose ~6% commissions + concessions — our number is net, theirs isn't.`);
    const nov = latest.get("novation");
    if (nov && sellerNum && nov.mao >= sellerNum) tips.push(`Our Novation number (${money(nov.mao)}) covers their ask — pivot: "What if I could get you ${money(sellerNum)}, we just need a little more time to close?"`);
    const cre = latest.get("creative");
    if (cre && sellerNum && cre.mao >= sellerNum) tips.push(`Creative terms reach ${money(cre.mao)} — ask: "If the price were right, would you be open to receiving it over time instead of all at once?"`);
    if (!tips.length && sellerNum && bestMao && sellerNum > bestMao) tips.push(`They're ${money(sellerNum - bestMao)} above our best number (${money(bestMao)}). Don't chase — ask "What would you do with the proceeds?" to surface the real need, then anchor with assessed value + sold comps.`);
    tips.push("Ask what they'd NET from their best alternative, then go quiet — let them fill the silence.");
    tips.push("No deal today ≠ dead: set a follow-up, most land sellers say yes between day 30 and 120.");
  }

  return (
    <div className="space-y-2 rounded-xl bg-indigo-50/50 p-3 ring-1 ring-indigo-100">
      <div className="flex items-center gap-2">
        <span className="text-xs font-extrabold text-indigo-900">🧮 Underwriting on file</span>
        <span className="ml-auto flex gap-1.5">
          <a href={`/reduction?address=${encodeURIComponent(addr)}&contract=${d.value ?? d.askPrice ?? ""}`} target="_blank" className="rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-700" title="Price reduction coach — pre-filled with this property">🔻 Reduction Play</a>
          <a href={calcHref} target="_blank" className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100">Open calculator ↗</a>
        </span>
      </div>
      {latest.size === 0 ? (
        <div className="text-[11px] text-slate-500">No saved underwriting matches this address yet — run it in the <a href={calcHref} target="_blank" className="font-bold text-indigo-700 underline">calculator</a> (address pre-filled) and the MAOs appear here automatically.</div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {[...latest.values()].map((u) => (
            <a key={u.tab} href={calcHref} target="_blank" className="rounded-lg bg-white p-2 ring-1 ring-indigo-100 hover:ring-indigo-300">
              <div className="text-[10px] font-bold text-slate-500">{UW_TABS[u.tab] ?? u.tab}</div>
              <div className="text-sm font-extrabold text-slate-900">{money(u.mao)} <span className="text-[9px] font-semibold text-slate-400">MAO</span></div>
              <div className="text-[10px] text-slate-400">fee {money(u.fee)} · {u.confidence}% conf · {u.by.split(" ")[0]} {new Date(u.at).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</div>
            </a>
          ))}
        </div>
      )}
      {(d.offers ?? []).length > 0 && (
        <div className="rounded-lg bg-white p-2.5 ring-1 ring-emerald-200">
          <div className="text-[11px] font-extrabold text-emerald-800">💵 Buyer offers received (auto-captured from email)</div>
          <div className="mt-1 space-y-1">
            {(d.offers ?? []).slice(0, 6).map((o, i) => (
              <div key={i} className="flex items-baseline gap-2 text-[11px]">
                <span className="font-extrabold text-slate-900">{money(o.amount)}</span>
                <span className="min-w-0 flex-1 truncate text-slate-500">{o.from}</span>
                <span className="text-slate-400">{new Date(o.at).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {(ourOffer > 0 || sellerNum > 0 || resp) && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {ourOffer > 0 && <span className="rounded-lg bg-white px-2 py-1 font-bold text-slate-700 ring-1 ring-slate-200">Our offer: {money(ourOffer)}</span>}
          {sellerNum > 0 && <span className="rounded-lg bg-white px-2 py-1 font-bold text-slate-700 ring-1 ring-slate-200">Seller: {money(sellerNum)}</span>}
          {resp && <span className={`rounded-lg px-2 py-1 font-bold ring-1 ${resp.includes("Accepted") ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : rejected ? "bg-red-50 text-red-700 ring-red-200" : "bg-white text-slate-600 ring-slate-200"}`}>{resp}</span>}
        </div>
      )}
      {tips.length > 0 && (
        <div className="rounded-lg bg-white p-2.5 ring-1 ring-amber-200">
          <div className="text-[11px] font-extrabold text-amber-800">🤝 Negotiation playbook — they said no. Try this:</div>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-slate-600">
            {tips.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// 🔀 Pipeline mover (Nick's ticket 2026-10-15): changing a lead's pipeline used
// to auto-save into the new pipeline's FIRST stage with no choice. Now picking a
// different pipeline reveals that pipeline's stages so you choose where the lead
// lands, then hit Move. Defaults to the first stage if you don't pick one.
function PipelineMover({ d, pipelineStages, setSaved, block }: { d: Payload; pipelineStages?: Record<string, Array<{ key: string; label: string }>>; setSaved: (s: string) => void; block?: boolean }) {
  const [pendingPipe, setPendingPipe] = useState<string | null>(null);
  const [pendingStage, setPendingStage] = useState<string>("");
  const [moving, startMove] = useTransition();
  const names = sortPipes(d.pipelines ?? [d.pipeline]);
  const targetStages = pendingPipe ? (pipelineStages?.[pendingPipe] ?? []) : [];
  const selCls = "rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-bold text-slate-700";
  const doMove = () => {
    if (!pendingPipe) return;
    const fd = new FormData(); fd.set("id", d.id); fd.set("pipeline", pendingPipe); if (pendingStage) fd.set("stage", pendingStage);
    startMove(async () => { await setOppPipelineAction(fd); setSaved("✓ Moved — refreshing"); window.location.reload(); });
  };
  return (
    <span className={block ? "flex flex-wrap items-center gap-1.5" : "flex items-center gap-1.5"}>
      <select value={pendingPipe ?? d.pipeline} className={block ? `${selCls} w-full` : selCls}
        onChange={(e) => { const p = e.target.value; if (p === d.pipeline) { setPendingPipe(null); return; } setPendingPipe(p); setPendingStage((pipelineStages?.[p] ?? [])[0]?.key ?? ""); }}>
        {names.map((pn) => <option key={pn} value={pn}>{pn}</option>)}
      </select>
      {pendingPipe && pendingPipe !== d.pipeline && (
        <>
          <span className="text-[11px] font-semibold text-slate-400">→ land in:</span>
          <select value={pendingStage} onChange={(e) => setPendingStage(e.target.value)} className={selCls}>
            {targetStages.length === 0 && <option value="">(first stage)</option>}
            {targetStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button type="button" onClick={doMove} disabled={moving} className="rounded-md bg-brand-navy px-2.5 py-0.5 text-[11px] font-bold text-white disabled:opacity-50">{moving ? "…" : "Move"}</button>
          <button type="button" onClick={() => setPendingPipe(null)} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600">cancel</button>
        </>
      )}
    </span>
  );
}

// 🔀 Unified Pipeline + Stage picker (Jon 2026-10-27): ONE control, not a confusing "land in +
// Move" sub-button next to a separate Stage dropdown. Changing the Pipeline repopulates the main
// Stage dropdown with THAT pipeline's full stage list; picking a stage in the SAME pipeline saves
// instantly; picking a different pipeline shows a single "→ Move to …" button that commits the
// move to the chosen stage. Renders two grid cells (Pipeline, Stage) for the 2-col details grid.
function PipelineStage({ d, pipelineStages, stages, setSaved, setData }: {
  d: Payload; pipelineStages?: Record<string, Array<{ key: string; label: string }>>; stages: Array<{ key: string; label: string }>;
  setSaved: (s: string) => void; setData: (d: Payload) => void;
}) {
  const [pipe, setPipe] = useState(d.pipeline);
  const [stage, setStage] = useState(d.stage);
  const [moving, startMove] = useTransition();
  const names = sortPipes(d.pipelines ?? [d.pipeline]);
  const changed = pipe !== d.pipeline;
  const curStages = pipelineStages?.[pipe] ?? (changed ? [] : stages);
  const onPipe = (p: string) => { setPipe(p); setStage(p === d.pipeline ? d.stage : ((pipelineStages?.[p] ?? [])[0]?.key ?? "")); };
  const onStage = (s: string) => {
    setStage(s);
    if (pipe === d.pipeline) { // same pipeline → save the stage instantly
      setData({ ...d, stage: s });
      const fd = new FormData(); fd.set("id", d.id); fd.set("stage", s);
      startMove(async () => { await setOppStageAction(fd); setSaved("✓ saved"); });
    }
  };
  const doMove = () => {
    const fd = new FormData(); fd.set("id", d.id); fd.set("pipeline", pipe); if (stage) fd.set("stage", stage);
    startMove(async () => { await setOppPipelineAction(fd); setSaved("✓ Moved — refreshing"); window.location.reload(); });
  };
  return (
    <>
      <div>
        <label className={labelCls}>Pipeline</label>
        <select value={pipe} onChange={(e) => onPipe(e.target.value)} className={inputCls}>
          {names.map((pn) => <option key={pn} value={pn}>{pn}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Stage{changed && <span className="font-normal normal-case text-amber-600"> — in {pipe}</span>}</label>
        <select value={stage} onChange={(e) => onStage(e.target.value)} className={inputCls}>
          {curStages.length === 0 && <option value="">(first stage)</option>}
          {curStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {changed && (
          <button type="button" onClick={doMove} disabled={moving} className="mt-1.5 w-full rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
            {moving ? "Moving…" : `→ Move to ${pipe}`}
          </button>
        )}
      </div>
    </>
  );
}

// 🧹🔗 GHL-imported notes carry raw HTML (e.g. <p style="margin:0px…">) that showed
// as literal text, and URLs weren't clickable (Jon 2026-10-15). Strip the HTML down
// to plain text (block tags → newlines, decode entities) and turn URLs into links.
function cleanLinkify(raw: string): ReactNode {
  const text = (raw || "")
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#39;|&rsquo;|&apos;/gi, "'").replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const parts: ReactNode[] = [];
  const re = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    let url = m[0];
    const trail = url.match(/[.,);:!?]+$/); // don't swallow trailing punctuation
    if (trail) url = url.slice(0, -trail[0].length);
    const href = url.startsWith("http") ? url : `https://${url}`;
    parts.push(<a key={`l${k++}`} href={href} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()} className="font-semibold text-indigo-600 underline decoration-indigo-300 break-all hover:text-indigo-800">{url}</a>);
    last = m.index + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}
