"use client";

import { useMemo, useState } from "react";
import { setBuyerStatus, logBuyerOutreach, saveProspect } from "@/app/actions";

export type Prospect = {
  id: string; name: string; website: string; email: string; phone: string;
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

type SortKey = "name" | "status" | "lastContacted" | "nextFollowUp";

export default function VettingTable({ areas, canEdit, today }: {
  areas: { area: string; prospects: Prospect[] }[];
  canEdit: boolean;
  today: string;
}) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "status", dir: 1 });
  const [editId, setEditId] = useState<string | null>(null);
  const [addArea, setAddArea] = useState<string | null>(null);

  const needle = q.trim().toLowerCase();
  const sortKeyVal = (p: Prospect): string => {
    if (sort.key === "status") return String(STATUS.findIndex((s) => s.key === statusOf(p)));
    if (sort.key === "name") return p.name.toLowerCase();
    if (sort.key === "lastContacted") return p.lastContacted || "0000";
    return p.nextFollowUp || "9999";
  };

  const shown = useMemo(() => areas.map(({ area, prospects }) => {
    let rows = prospects;
    if (needle) rows = rows.filter((p) => [p.name, p.phone, p.email, p.buyBoxAreas, hostOf(p.website)].join(" ").toLowerCase().includes(needle));
    if (statusFilter) rows = rows.filter((p) => statusOf(p) === statusFilter);
    rows = [...rows].sort((a, b) => sortKeyVal(a).localeCompare(sortKeyVal(b)) * sort.dir);
    return { area, rows };
  }).filter((g) => g.rows.length > 0 || !needle && !statusFilter), [areas, needle, statusFilter, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) } : { key, dir: 1 });
  const arrow = (key: SortKey) => sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "";
  const Th = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`cursor-pointer select-none px-2 py-2 text-left font-semibold text-slate-500 hover:text-slate-800 ${className}`} onClick={() => toggleSort(k)}>{children}{arrow(k)}</th>
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search developer, phone, email, area…" className="w-72 max-w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">All statuses</option>
          {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {(q || statusFilter) && <button onClick={() => { setQ(""); setStatusFilter(""); }} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Clear</button>}
      </div>

      {shown.length === 0 && <p className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-400">No prospects match.</p>}

      {shown.map(({ area, rows }) => (
        <details key={area} open className="overflow-hidden rounded-xl border border-slate-200">
          <summary className="cursor-pointer bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700">
            🏗 {area} <span className="font-normal text-slate-400">· {rows.length}</span>
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-white text-[11px] uppercase tracking-wide">
                  <Th k="name">Developer</Th>
                  <th className="px-2 py-2 text-left font-semibold text-slate-500">Contact</th>
                  <th className="px-2 py-2 text-left font-semibold text-slate-500">Buying area</th>
                  <Th k="lastContacted">Last touch</Th>
                  <Th k="nextFollowUp">Next</Th>
                  <Th k="status">Status</Th>
                  {canEdit && <th className="px-2 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const cur = statusOf(p);
                  const m = meta(cur);
                  const overdue = p.nextFollowUp && p.nextFollowUp < today;
                  const due = p.nextFollowUp && p.nextFollowUp === today;
                  return (
                    <tr key={p.id} className="border-b border-slate-50 align-top hover:bg-slate-50/60">
                      <td className="px-2 py-2">
                        <div className="font-semibold text-slate-800">{p.name}</div>
                        {p.website && <a href={siteOf(p.website)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand-navy hover:underline">🔗 {hostOf(p.website)}</a>}
                        {p.outreachLog && <details className="mt-0.5"><summary className="cursor-pointer text-[10px] text-slate-400">log</summary><div className="whitespace-pre-wrap text-[10px] text-slate-500">{p.outreachLog}</div></details>}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {p.phone && <div className="text-slate-700">📞 {p.phone}</div>}
                        {p.email && <a href={`mailto:${p.email}`} className="text-brand-navy hover:underline">✉️ {p.email}</a>}
                        {p.igHandle && <div className="text-violet-700">📸 {p.igHandle}</div>}
                      </td>
                      <td className="px-2 py-2 text-xs text-emerald-700">{p.buyBoxAreas}</td>
                      <td className="px-2 py-2 text-xs text-slate-500">{p.lastContacted || "—"}</td>
                      <td className="px-2 py-2 text-xs">
                        {p.nextFollowUp ? <span className={overdue ? "font-bold text-rose-600" : due ? "font-bold text-amber-600" : "text-slate-500"}>{p.nextFollowUp}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-2">
                        {canEdit ? (
                          <form action={setBuyerStatus}>
                            <input type="hidden" name="id" value={p.id} />
                            <select name="status" defaultValue={cur} onChange={(e) => e.currentTarget.form?.requestSubmit()} className={`rounded-full border-0 px-2 py-1 text-[11px] font-bold ${m.cls}`}>
                              {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                          </form>
                        ) : <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${m.cls}`}>{m.label}</span>}
                      </td>
                      {canEdit && (
                        <td className="px-2 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <form action={logBuyerOutreach}>
                              <input type="hidden" name="id" value={p.id} />
                              <button className="rounded bg-sky-600 px-1.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-700" title="Log a touch (counts toward Buyers Contacted) + set a 3-day follow-up">📇</button>
                            </form>
                            <button onClick={() => setEditId(editId === p.id ? null : p.id)} className="rounded bg-slate-100 px-1.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200" title="Edit">✎</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                }).flatMap((rowEl, i) => {
                  const p = rows[i];
                  if (editId !== p.id) return [rowEl];
                  return [rowEl, (
                    <tr key={p.id + "-edit"} className="bg-amber-50/60">
                      <td colSpan={canEdit ? 7 : 6} className="px-3 py-3">
                        <form action={saveProspect} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <input type="hidden" name="id" value={p.id} />
                          <label className="text-xs"><span className="text-slate-500">Developer</span><input name="name" defaultValue={p.name} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" required /></label>
                          <label className="text-xs"><span className="text-slate-500">Phone(s)</span><input name="phone" defaultValue={p.phone} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" /></label>
                          <label className="text-xs"><span className="text-slate-500">Email</span><input name="email" defaultValue={p.email} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" /></label>
                          <label className="text-xs"><span className="text-slate-500">Website</span><input name="website" defaultValue={p.website} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" /></label>
                          <label className="text-xs"><span className="text-slate-500">Buying area</span><input name="buyBoxAreas" defaultValue={p.buyBoxAreas} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" /></label>
                          <label className="text-xs"><span className="text-slate-500">Next follow-up</span><input type="date" name="nextFollowUp" defaultValue={p.nextFollowUp} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" /></label>
                          <div className="sm:col-span-3"><button className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white">Save</button></div>
                        </form>
                      </td>
                    </tr>
                  )];
                })}
              </tbody>
            </table>
          </div>

          {/* Add a developer to this area */}
          {canEdit && (
            <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-2">
              {addArea === area ? (
                <form action={saveProspect} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <input type="hidden" name="vetArea" value={area} />
                  <input name="name" placeholder="Developer name *" className="rounded border border-slate-300 px-2 py-1 text-xs" required />
                  <input name="phone" placeholder="Phone" className="rounded border border-slate-300 px-2 py-1 text-xs" />
                  <input name="email" placeholder="Email" className="rounded border border-slate-300 px-2 py-1 text-xs" />
                  <input name="website" placeholder="Website" className="rounded border border-slate-300 px-2 py-1 text-xs" />
                  <input name="buyBoxAreas" placeholder="Buying area" className="rounded border border-slate-300 px-2 py-1 text-xs sm:col-span-2" />
                  <div className="sm:col-span-2"><button className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Add developer</button> <button type="button" onClick={() => setAddArea(null)} className="text-xs text-slate-500">cancel</button></div>
                </form>
              ) : (
                <button onClick={() => setAddArea(area)} className="text-xs font-semibold text-brand-navy hover:underline">+ Add a developer to this area</button>
              )}
            </div>
          )}
        </details>
      ))}
    </div>
  );
}
