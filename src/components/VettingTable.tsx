"use client";

import { useMemo, useState } from "react";
import { setBuyerStatus, logBuyerOutreach, saveProspectField, saveProspect } from "@/app/actions";

export type Prospect = {
  id: string; name: string; website: string; email: string; phone: string; phone2: string;
  buyBoxAreas: string; outreachLog: string; lastContacted: string; nextFollowUp: string;
  vetStage: string; vetStatus: string; igHandle: string;
};

const STATUS: { key: string; label: string; cls: string }[] = [
  { key: "to_contact", label: "To contact", cls: "bg-slate-100 text-slate-600" },
  { key: "contacted", label: "Contacted", cls: "bg-sky-100 text-sky-700" },
  { key: "messaged", label: "Messaged", cls: "bg-indigo-100 text-indigo-700" },
  { key: "following_up", label: "Following up", cls: "bg-amber-100 text-amber-700" },
  { key: "vetted", label: "✓ Vetted", cls: "bg-emerald-100 text-emerald-700" },
  { key: "not_interested", label: "✕ Not interested", cls: "bg-rose-100 text-rose-700" },
];
const statusOf = (p: Prospect) => p.vetStage === "dead" ? "not_interested" : (p.vetStage === "vetted" || p.vetStage === "active") ? "vetted" : (p.vetStatus || "to_contact");
const meta = (k: string) => STATUS.find((s) => s.key === k) ?? STATUS[0];
const siteOf = (s: string) => (s || "").split(/\s+/)[0];
const hostOf = (s: string) => { try { return new URL(siteOf(s)).hostname.replace(/^www\./, ""); } catch { return siteOf(s).replace(/^https?:\/\//, "").split("/")[0]; } };

type SortKey = "name" | "status";

// One inline-editable spreadsheet cell — autosaves on blur if changed.
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

export default function VettingTable({ areas, canEdit, today }: {
  areas: { area: string; prospects: Prospect[] }[];
  canEdit: boolean;
  today: string;
}) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "status", dir: 1 });

  const needle = q.trim().toLowerCase();
  const sortKeyVal = (p: Prospect): string => sort.key === "status" ? String(STATUS.findIndex((s) => s.key === statusOf(p))) : p.name.toLowerCase();

  const shown = useMemo(() => areas.map(({ area, prospects }) => {
    let rows = prospects;
    if (needle) rows = rows.filter((p) => [p.name, p.phone, p.phone2, p.email, p.buyBoxAreas, p.outreachLog, hostOf(p.website)].join(" ").toLowerCase().includes(needle));
    if (statusFilter) rows = rows.filter((p) => statusOf(p) === statusFilter);
    rows = [...rows].sort((a, b) => sortKeyVal(a).localeCompare(sortKeyVal(b)) * sort.dir);
    return { area, rows };
  }).filter((g) => g.rows.length > 0 || (!needle && !statusFilter)), [areas, needle, statusFilter, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) } : { key, dir: 1 });
  const arrow = (key: SortKey) => sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "";

  return (
    <div className="space-y-4">
      {/* Filters (same idea as the spreadsheet's column filters) */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Filter: website, name, number, email, notes, area…" className="w-80 max-w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">All statuses</option>
          {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button onClick={() => toggleSort("name")} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Name{arrow("name")}</button>
        <button onClick={() => toggleSort("status")} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Status{arrow("status")}</button>
        {(q || statusFilter) && <button onClick={() => { setQ(""); setStatusFilter(""); }} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Clear</button>}
        {canEdit && <span className="ml-auto text-[11px] text-slate-400">Tip: click any cell to edit — changes save automatically.</span>}
      </div>

      {shown.length === 0 && <p className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-400">No prospects match.</p>}

      {shown.map(({ area, rows }) => (
        <details key={area} open className="overflow-hidden rounded-xl border border-slate-200">
          <summary className="cursor-pointer bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700">
            🏗 {area} <span className="font-normal text-slate-400">· {rows.length}</span>
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-xs">
              <thead>
                <tr className="border-y border-slate-200 bg-white text-[10px] uppercase tracking-wide text-slate-500 [&>th]:border-r [&>th]:border-slate-100 [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
                  <th className="w-28">Website</th>
                  <th className="w-44">Name</th>
                  <th className="w-32">Number</th>
                  <th className="w-32">Number</th>
                  <th className="w-44">Email</th>
                  <th>Notes</th>
                  <th className="w-40">Buying area</th>
                  <th className="w-28">Status</th>
                </tr>
              </thead>
              <tbody className="[&>tr>td]:border-r [&>tr>td]:border-slate-100">
                {rows.map((p) => {
                  const cur = statusOf(p);
                  const m = meta(cur);
                  const overdue = p.nextFollowUp && p.nextFollowUp < today && cur !== "vetted" && cur !== "not_interested";
                  return (
                    <tr key={p.id} className={`border-b border-slate-100 align-top hover:bg-sky-50/40 ${overdue ? "bg-rose-50/40" : ""}`}>
                      {/* Website */}
                      <td className="px-1 py-1">
                        {canEdit ? <Cell id={p.id} field="website" value={p.website} placeholder="website" />
                          : p.website && <a href={siteOf(p.website)} target="_blank" rel="noopener noreferrer" className="px-1.5 text-brand-navy hover:underline">{hostOf(p.website)}</a>}
                        {p.website && <a href={siteOf(p.website)} target="_blank" rel="noopener noreferrer" className="ml-1 text-[10px] text-slate-400 hover:text-brand-navy" title="open">↗</a>}
                      </td>
                      {/* Name */}
                      <td className="px-1 py-1 font-semibold text-slate-800">{canEdit ? <Cell id={p.id} field="name" value={p.name} /> : p.name}</td>
                      {/* Number 1 / 2 */}
                      <td className="px-1 py-1">{canEdit ? <Cell id={p.id} field="phone" value={p.phone} placeholder="—" mono /> : <span className="px-1.5">{p.phone}</span>}</td>
                      <td className="px-1 py-1">{canEdit ? <Cell id={p.id} field="phone2" value={p.phone2} placeholder="—" mono /> : <span className="px-1.5">{p.phone2}</span>}</td>
                      {/* Email */}
                      <td className="px-1 py-1">{canEdit ? <Cell id={p.id} field="email" value={p.email} placeholder="email" /> : p.email && <a href={`mailto:${p.email}`} className="px-1.5 text-brand-navy hover:underline">{p.email}</a>}</td>
                      {/* Notes */}
                      <td className="px-1 py-1 text-slate-600">{canEdit ? <Cell id={p.id} field="outreachLog" value={p.outreachLog} placeholder="notes…" /> : <span className="whitespace-pre-wrap px-1.5">{p.outreachLog}</span>}</td>
                      {/* Buying area */}
                      <td className="px-1 py-1 text-emerald-700">{canEdit ? <Cell id={p.id} field="buyBoxAreas" value={p.buyBoxAreas} placeholder="areas they buy" /> : <span className="px-1.5">{p.buyBoxAreas}</span>}</td>
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
                            <form action={logBuyerOutreach}>
                              <input type="hidden" name="id" value={p.id} />
                              <button className="rounded bg-sky-600 px-1.5 py-1 text-[10px] font-semibold text-white hover:bg-sky-700" title="Log a touch (counts toward Buyers Contacted) + 3-day follow-up">📇</button>
                            </form>
                          </div>
                        ) : <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${m.cls}`}>{m.label}</span>}
                        {p.lastContacted && <div className="mt-0.5 px-0.5 text-[9px] text-slate-400">last {p.lastContacted}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add a developer to this area */}
          {canEdit && (
            <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-2">
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-brand-navy">+ Add a developer to this area</summary>
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
