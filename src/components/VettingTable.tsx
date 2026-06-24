"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { setBuyerStatus, logBuyerOutreach, saveProspectField, saveProspect, saveBuyerBox, deleteProspect } from "@/app/actions";
import MultiSelect from "@/components/MultiSelect";

export type Prospect = {
  id: string; name: string; website: string; email: string; phone: string; phone2: string;
  buyBoxAreas: string; outreachLog: string; lastContacted: string; nextFollowUp: string;
  vetStage: string; vetStatus: string; igHandle: string; touchOn?: string;
  // CRM buy-box detail
  category: string; type: string; title: string; company: string; preferredContact: string;
  dealType: string; buildType: string; closingSpeed: string; priceRange: string; minLotSize: string;
  propertyType: string; minBeds: string; maxBaths: string; conditionTolerance: string; needsView: string;
  marketDetails: string; decisionMaker: string; buyingFrequency: string; bestContact: string;
};

const STATUS: { key: string; label: string; cls: string }[] = [
  { key: "to_contact", label: "To contact", cls: "bg-slate-100 text-slate-600" },
  { key: "contacted", label: "Contacted", cls: "bg-sky-100 text-sky-700" },
  { key: "messaged", label: "Messaged", cls: "bg-indigo-100 text-indigo-700" },
  { key: "following_up", label: "Following up", cls: "bg-amber-100 text-amber-700" },
  { key: "vetted", label: "✓ Vetted", cls: "bg-emerald-100 text-emerald-700" },
  { key: "not_interested", label: "✕ Not interested", cls: "bg-rose-100 text-rose-700" },
];
// CRM dropdown options (mirrors the Vetted-Buyers form).
const PREFERRED_CONTACT = ["Phone call", "Text / SMS", "Email", "Instagram DM", "WhatsApp"];
const DEAL_TYPE = ["Land / lots", "Teardown", "Entitled lots", "Off-market", "JV / partnership", "Build-to-rent"];
const BUILD_TYPE = ["SFR", "Townhomes", "Multifamily", "Mixed-use", "Custom luxury", "Spec homes"];
const SPEED = ["Cash, < 14 days", "15–30 days", "30–45 days", "Financed"];
const DECISION_MAKER = ["Direct / principal", "Acquisitions manager", "Agent / broker", "Not direct (B-rated)"];
const BUYING_FREQ = ["1+ / week", "1–3 / month", "A few / quarter", "Opportunistic"];
const PROPERTY_TYPE = ["SFR", "Condo / Townhome", "Small multi (2–4)", "Mobile / Manufactured", "Any"];
const CONDITION = ["Any / teardown OK", "Heavy rehab", "Light–moderate", "Turnkey only"];
const NEEDS_VIEW = ["No — offers sight-unseen", "Yes — needs walkthrough", "Sometimes"];

const statusOf = (p: Prospect) => p.vetStage === "dead" ? "not_interested" : (p.vetStage === "vetted" || p.vetStage === "active") ? "vetted" : (p.vetStatus || "to_contact");
const meta = (k: string) => STATUS.find((s) => s.key === k) ?? STATUS[0];
const siteOf = (s: string) => (s || "").split(/\s+/)[0];
const hostOf = (s: string) => { try { return new URL(siteOf(s)).hostname.replace(/^www\./, ""); } catch { return siteOf(s).replace(/^https?:\/\//, "").split("/")[0]; } };
const isDev = (p: Prospect) => p.category === "luxury" || p.type === "developer";
// Compact buy-box summary shown inline (detail without expanding).
function buyBoxChips(p: Prospect): string[] {
  const parts = isDev(p)
    ? [p.dealType, p.buildType, p.priceRange, p.minLotSize && `lot ${p.minLotSize}`, p.closingSpeed]
    : [p.propertyType, p.priceRange, p.conditionTolerance, (p.minBeds || p.maxBaths) && `${p.minBeds || "?"}bd/${p.maxBaths || "?"}ba`, p.closingSpeed];
  return parts.flatMap((x) => (x ? String(x).split(",").map((s) => s.trim()) : [])).filter(Boolean);
}

type SortKey = "name" | "status";

// Inline-editable spreadsheet cell — autosaves on blur if changed.
function Cell({ id, field, value, placeholder, mono }: { id: string; field: string; value: string; placeholder?: string; mono?: boolean }) {
  return (
    <form action={saveProspectField} className="contents">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="field" value={field} />
      <input
        name="value" defaultValue={value} placeholder={placeholder}
        onBlur={(e) => { if (e.currentTarget.value !== value) e.currentTarget.form?.requestSubmit(); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        className={`w-full min-w-[80px] rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-slate-200 focus:border-sky-400 focus:bg-white focus:outline-none ${mono ? "tabular-nums" : ""}`}
      />
    </form>
  );
}
// Bigger multi-line Notes cell — autosaves ~1s after you stop typing AND on blur, so
// notes never get lost (e.g. if you click "Log touch" right after typing).
function NotesCell({ id, value }: { id: string; value: string }) {
  const [status, setStatus] = useState<"idle" | "dirty" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Auto-grow to fit all the text (developer/buyer notes are long) so nothing is hidden
  // behind a scrollbar — capped so one giant note can't take over the screen.
  const grow = (ta: HTMLTextAreaElement) => { ta.style.height = "auto"; ta.style.height = `${Math.min(ta.scrollHeight, 520)}px`; };
  useEffect(() => { if (taRef.current) grow(taRef.current); }, []);
  const save = (ta: HTMLTextAreaElement) => { if (ta.value !== value) { ta.form?.requestSubmit(); setStatus("saved"); } };
  return (
    <form action={saveProspectField} className="contents">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="field" value="outreachLog" />
      <div className="min-w-[420px]">
        <textarea
          ref={taRef}
          name="value" defaultValue={value} placeholder="notes — touches, replies, who to ask for, next step…" rows={4}
          onChange={(e) => { const ta = e.currentTarget; grow(ta); setStatus("dirty"); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => save(ta), 1000); }}
          onBlur={(e) => { if (timer.current) clearTimeout(timer.current); save(e.currentTarget); }}
          className="block w-full resize-y overflow-hidden whitespace-pre-wrap break-words rounded border border-transparent bg-transparent px-2 py-1.5 text-[13px] leading-relaxed hover:border-slate-200 focus:border-sky-400 focus:bg-white focus:outline-none"
        />
        <div className="h-3 px-1 text-[9px] font-semibold">
          {status === "dirty" && <span className="text-amber-600">● typing… autosaves</span>}
          {status === "saved" && <span className="text-emerald-600">✓ saved</span>}
        </div>
      </div>
    </form>
  );
}

const fieldCls = "w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-slate-200";
const labCls = "mb-0.5 block text-[10px] font-semibold text-slate-500";
function Sel({ name, label, def, options }: { name: string; label: string; def: string; options: string[] }) {
  return <label><span className={labCls}>{label}</span><select name={name} defaultValue={def} className={fieldCls}><option value="">—</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>;
}
function Inp({ name, label, def, placeholder }: { name: string; label: string; def: string; placeholder?: string }) {
  return <label><span className={labCls}>{label}</span><input name={name} defaultValue={def} placeholder={placeholder} className={fieldCls} /></label>;
}

// Expandable CRM buy-box panel — type (developer vs fix/flip) + the dropdowns.
function BuyBoxPanel({ p }: { p: Prospect }) {
  const [cat, setCat] = useState(p.category === "luxury" ? "luxury" : "distressed");
  const dev = cat === "luxury";
  return (
    <form action={saveBuyerBox} className="grid grid-cols-2 gap-2 bg-slate-50/70 p-3 sm:grid-cols-4">
      <input type="hidden" name="id" value={p.id} />
      <label><span className={labCls}>Buyer type</span>
        <select name="category" value={cat} onChange={(e) => setCat(e.target.value)} className={`${fieldCls} font-semibold`}>
          <option value="luxury">🏗 Developer</option>
          <option value="distressed">🔨 Fix &amp; Flipper</option>
        </select>
      </label>
      <Inp name="title" label="Contact name / title" def={p.title} />
      <Inp name="company" label="Company / Dev firm" def={p.company} />
      <MultiSelect name="preferredContact" label="Preferred contact" defaultValue={p.preferredContact} options={PREFERRED_CONTACT} />

      {dev ? (
        <>
          <MultiSelect name="dealType" label="Deal type (pick all)" defaultValue={p.dealType} options={DEAL_TYPE} />
          <MultiSelect name="buildType" label="Build type (pick all)" defaultValue={p.buildType} options={BUILD_TYPE} />
          <Sel name="closingSpeed" label="Move speed" def={p.closingSpeed} options={SPEED} />
          <Inp name="priceRange" label="Price range per lot" def={p.priceRange} placeholder="$400k–$700k" />
          <Inp name="minLotSize" label="Minimum lot size" def={p.minLotSize} placeholder="7,000 sf" />
          {/* keep flipper-only fields submitted as their current values */}
          <input type="hidden" name="propertyType" value={p.propertyType} />
          <input type="hidden" name="minBeds" value={p.minBeds} />
          <input type="hidden" name="maxBaths" value={p.maxBaths} />
          <input type="hidden" name="conditionTolerance" value={p.conditionTolerance} />
          <input type="hidden" name="needsView" value={p.needsView} />
          <input type="hidden" name="marketDetails" value={p.marketDetails} />
        </>
      ) : (
        <>
          <MultiSelect name="propertyType" label="Property type (pick all)" defaultValue={p.propertyType} options={PROPERTY_TYPE} />
          <Inp name="priceRange" label="Price range buy box" def={p.priceRange} placeholder="$300k–$800k" />
          <Inp name="minBeds" label="Min bedrooms" def={p.minBeds} />
          <Inp name="maxBaths" label="Max bathrooms" def={p.maxBaths} />
          <MultiSelect name="conditionTolerance" label="Condition tolerance (pick all)" defaultValue={p.conditionTolerance} options={CONDITION} />
          <Sel name="closingSpeed" label="Closing speed" def={p.closingSpeed} options={SPEED} />
          <Sel name="needsView" label="Needs to view first?" def={p.needsView} options={NEEDS_VIEW} />
          <Inp name="marketDetails" label="Market details" def={p.marketDetails} />
          <input type="hidden" name="dealType" value={p.dealType} />
          <input type="hidden" name="buildType" value={p.buildType} />
          <input type="hidden" name="minLotSize" value={p.minLotSize} />
        </>
      )}

      <Sel name="decisionMaker" label="Decision maker?" def={p.decisionMaker} options={DECISION_MAKER} />
      <Sel name="buyingFrequency" label="Buying frequency" def={p.buyingFrequency} options={BUYING_FREQ} />
      <Inp name="bestContact" label="Best way to reach (sequence)" def={p.bestContact} placeholder="IG DM → email → call" />
      <div className="col-span-2 flex items-end sm:col-span-1">
        <button className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy-700">Save buy box</button>
      </div>
    </form>
  );
}

export default function VettingTable({ areas, canEdit, today, allowAdd = true }: {
  areas: { area: string; prospects: Prospect[] }[];
  canEdit: boolean;
  today: string;
  allowAdd?: boolean;
}) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "status", dir: 1 });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const needle = q.trim().toLowerCase();
  const sortKeyVal = (p: Prospect): string => sort.key === "status" ? String(STATUS.findIndex((s) => s.key === statusOf(p))) : p.name.toLowerCase();

  const shown = useMemo(() => areas.map(({ area, prospects }) => {
    let rows = prospects;
    if (needle) rows = rows.filter((p) => [p.name, p.phone, p.phone2, p.email, p.buyBoxAreas, p.outreachLog, p.company, hostOf(p.website)].join(" ").toLowerCase().includes(needle));
    if (statusFilter) rows = rows.filter((p) => statusOf(p) === statusFilter);
    if (typeFilter) rows = rows.filter((p) => typeFilter === "dev" ? isDev(p) : !isDev(p));
    rows = [...rows].sort((a, b) => sortKeyVal(a).localeCompare(sortKeyVal(b)) * sort.dir);
    return { area, rows };
  }).filter((g) => g.rows.length > 0 || (!needle && !statusFilter && !typeFilter)), [areas, needle, statusFilter, typeFilter, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) } : { key, dir: 1 });
  const arrow = (key: SortKey) => sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "";

  return (
    <div className="space-y-4">
      {/* Filters (same idea as the spreadsheet's column filters) */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Filter: website, name, number, email, notes, area…" className="w-80 max-w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">All types</option>
          <option value="dev">🏗 Developers</option>
          <option value="flip">🔨 Fix &amp; Flip</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">All statuses</option>
          {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button onClick={() => toggleSort("name")} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Name{arrow("name")}</button>
        <button onClick={() => toggleSort("status")} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Status{arrow("status")}</button>
        {(q || statusFilter || typeFilter) && <button onClick={() => { setQ(""); setStatusFilter(""); setTypeFilter(""); }} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Clear</button>}
        {canEdit && <span className="ml-auto text-[11px] text-slate-400">Click a cell to edit (autosaves) · ⊕ opens the buy box</span>}
      </div>

      {shown.length === 0 && <p className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-400">No prospects match.</p>}

      {shown.map(({ area, rows }) => (
        <details key={area} open className="overflow-hidden rounded-xl border border-slate-200">
          <summary className="cursor-pointer bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700">
            {area} <span className="font-normal text-slate-400">· {rows.length}</span>
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px] border-collapse text-xs">
              <thead>
                <tr className="border-y border-slate-200 bg-white text-[10px] uppercase tracking-wide text-slate-500 [&>th]:border-r [&>th]:border-slate-100 [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
                  <th className="w-24">Website</th>
                  <th className="w-48">Name</th>
                  <th className="w-32">Number</th>
                  <th className="w-32">Number</th>
                  <th className="w-44">Email</th>
                  <th className="w-[340px]">Notes</th>
                  <th className="w-36">Buying area</th>
                  <th className="w-44">Buy box</th>
                  <th className="w-28">Status</th>
                </tr>
              </thead>
              <tbody className="[&>tr>td]:border-r [&>tr>td]:border-slate-100">
                {rows.map((p) => {
                  const cur = statusOf(p);
                  const m = meta(cur);
                  const overdue = p.nextFollowUp && p.nextFollowUp < today && cur !== "vetted" && cur !== "not_interested";
                  const expanded = open.has(p.id);
                  return (
                    <Fragment key={p.id}>
                      <tr className={`border-b border-slate-100 align-top hover:bg-sky-50/40 ${overdue ? "bg-rose-50/40" : ""}`}>
                        {/* Website */}
                        <td className="px-1 py-1">
                          {canEdit ? <Cell id={p.id} field="website" value={p.website} placeholder="website" />
                            : p.website && <a href={siteOf(p.website)} target="_blank" rel="noopener noreferrer" className="px-1.5 text-brand-navy hover:underline">{hostOf(p.website)}</a>}
                          {p.website && <a href={siteOf(p.website)} target="_blank" rel="noopener noreferrer" className="ml-1 text-[10px] text-slate-400 hover:text-brand-navy" title="open">↗</a>}
                        </td>
                        {/* Name + type badge + expand */}
                        <td className="px-1 py-1">
                          <div className="flex items-center gap-1">
                            {canEdit && <button onClick={() => toggleOpen(p.id)} className="shrink-0 rounded bg-slate-100 px-1 text-[11px] font-bold text-slate-500 hover:bg-slate-200" title="Buy box details">{expanded ? "⊖" : "⊕"}</button>}
                            <span className="shrink-0 text-[11px]" title={isDev(p) ? "Developer" : "Fix & Flipper"}>{isDev(p) ? "🏗" : "🔨"}</span>
                            <div className="min-w-0 flex-1 font-semibold text-slate-800">{canEdit ? <Cell id={p.id} field="name" value={p.name} /> : p.name}</div>
                          </div>
                        </td>
                        {/* Number 1 / 2 */}
                        <td className="px-1 py-1">{canEdit ? <Cell id={p.id} field="phone" value={p.phone} placeholder="—" mono /> : <span className="px-1.5">{p.phone}</span>}</td>
                        <td className="px-1 py-1">{canEdit ? <Cell id={p.id} field="phone2" value={p.phone2} placeholder="—" mono /> : <span className="px-1.5">{p.phone2}</span>}</td>
                        {/* Email */}
                        <td className="px-1 py-1">{canEdit ? <Cell id={p.id} field="email" value={p.email} placeholder="email" /> : p.email && <a href={`mailto:${p.email}`} className="px-1.5 text-brand-navy hover:underline">{p.email}</a>}</td>
                        {/* Notes — bigger */}
                        <td className="px-1 py-1 text-slate-600">{canEdit ? <NotesCell id={p.id} value={p.outreachLog} /> : <span className="whitespace-pre-wrap px-1.5">{p.outreachLog}</span>}</td>
                        {/* Buying area */}
                        <td className="px-1 py-1 text-emerald-700">{canEdit ? <Cell id={p.id} field="buyBoxAreas" value={p.buyBoxAreas} placeholder="areas they buy" /> : <span className="px-1.5">{p.buyBoxAreas}</span>}</td>
                        {/* Buy box summary (edit via ⊕) */}
                        <td className="px-1.5 py-1 align-top">
                          {(() => { const chips = buyBoxChips(p); return chips.length
                            ? <div className="flex flex-wrap gap-0.5">{chips.map((x, i) => <span key={i} className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-medium text-slate-600">{x}</span>)}</div>
                            : canEdit ? <button onClick={() => toggleOpen(p.id)} className="text-[10px] text-slate-300 hover:text-brand-navy">+ buy box</button> : <span className="text-slate-300">—</span>; })()}
                        </td>
                        {/* Status + quick log */}
                        <td className="px-1.5 py-1.5">
                          {canEdit ? (
                            <div className="flex items-center gap-1">
                              <form action={setBuyerStatus}>
                                <input type="hidden" name="id" value={p.id} />
                                <select name="status" defaultValue={cur} onChange={(e) => e.currentTarget.form?.requestSubmit()} className={`rounded-full border-0 px-1.5 py-1 text-[10px] font-bold ${m.cls}`}>
                                  {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                                </select>
                              </form>
                              {p.touchOn === today ? (
                                <span className="rounded bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700" title="Already logged a touch on this lead today — counts once toward Developers Contacted">✓ Logged today</span>
                              ) : (
                                <form action={logBuyerOutreach}>
                                  <input type="hidden" name="id" value={p.id} />
                                  <button className="rounded-md bg-sky-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-sky-700" title="Log a developer touch — counts toward Developers Contacted + sets a 3-day follow-up. Save your note first.">📇 Log touch</button>
                                </form>
                              )}
                              <form action={deleteProspect}>
                                <input type="hidden" name="id" value={p.id} />
                                <button onClick={(e) => { if (!confirm(`Delete ${p.name}? This can't be undone.`)) e.preventDefault(); }} className="rounded px-1.5 py-1 text-[10px] font-semibold text-slate-300 hover:bg-red-50 hover:text-red-600" title="Delete this buyer">🗑</button>
                              </form>
                            </div>
                          ) : <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${m.cls}`}>{m.label}</span>}
                          {p.lastContacted && <div className="mt-0.5 px-0.5 text-[9px] text-slate-400">last {p.lastContacted}</div>}
                        </td>
                      </tr>
                      {canEdit && expanded && (
                        <tr key={p.id + "-box"}>
                          <td colSpan={9} className="border-b border-slate-200 p-0"><BuyBoxPanel p={p} /></td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add a developer to this area */}
          {canEdit && allowAdd && (
            <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-2">
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-brand-navy">+ Add a buyer to this area</summary>
                <AddRow area={area} />
              </details>
            </div>
          )}
        </details>
      ))}
    </div>
  );
}

// Add-a-row form (uses the richer saveProspect action to create the contact).
function AddRow({ area }: { area: string }) {
  return (
    <form action={saveProspect} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-6">
      <input type="hidden" name="vetArea" value={area} />
      <input name="website" placeholder="Website" className="rounded border border-slate-300 px-2 py-1 text-xs" />
      <input name="name" placeholder="Name *" className="rounded border border-slate-300 px-2 py-1 text-xs" required />
      <input name="phone" placeholder="Number" className="rounded border border-slate-300 px-2 py-1 text-xs" />
      <input name="email" placeholder="Email" className="rounded border border-slate-300 px-2 py-1 text-xs" />
      <input name="buyBoxAreas" placeholder="Buying area" className="rounded border border-slate-300 px-2 py-1 text-xs" />
      <button className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700">Add</button>
    </form>
  );
}
