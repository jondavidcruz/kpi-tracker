"use client";
// 📈 Listing / price history — a Zillow-style table on the deal (Jon 2026-10-29). Record what
// the property was previously listed / sold for so the team can judge novation viability
// (list it higher than the last list price?) without re-pulling Zillow every time.
import { useState, useTransition } from "react";
import { saveListingHistoryAction } from "@/app/crm/actions";
import { LISTING_EVENTS, listingSummary, zillowUrl, type ListingRow } from "@/lib/listing-history";

export default function ListingHistoryPanel({ oppId, rows: initial, address, onSaved }: {
  oppId: string; rows: ListingRow[]; address?: string; onSaved?: () => void;
}) {
  const [rows, setRows] = useState<ListingRow[]>(initial.length ? initial : [{ date: "", event: "", price: "", source: "" }]);
  const [saving, start] = useTransition();
  const [saved, setSaved] = useState("");

  const update = (i: number, field: keyof ListingRow, v: string) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [field]: v } : row)));
  const addRow = () => setRows((r) => [...r, { date: "", event: "", price: "", source: "" }]);
  const removeRow = (i: number) => setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : [{ date: "", event: "", price: "", source: "" }]));
  const save = () => {
    const clean = rows.filter((r) => r.date.trim() || r.event.trim() || r.price.trim());
    const fd = new FormData(); fd.set("oppId", oppId); fd.set("rows", JSON.stringify(clean));
    start(async () => { await saveListingHistoryAction(fd); setSaved("✓ Saved"); setTimeout(() => setSaved(""), 2500); onSaved?.(); });
  };

  const sum = listingSummary(rows.filter((r) => r.price));
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-extrabold text-slate-800">📈 Listing / price history</span>
        <a href={zillowUrl(address)} target="_blank" rel="noopener noreferrer" className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100">🔗 Open on Zillow</a>
        {saved && <span className="ml-auto text-[11px] font-bold text-emerald-600">{saved}</span>}
      </div>
      <p className="mb-2 text-[11px] text-slate-500">Pull the property&apos;s price history from Zillow and log it here — knowing the last <b>list</b> price tells us if novation works (can we list it higher?).</p>

      {/* quick read: last listed / last sold */}
      {(sum.lastListed || sum.lastSold) && (
        <div className="mb-2 flex flex-wrap gap-2">
          {sum.lastListed && <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">🏷 Last listed: {sum.lastListed.price}{sum.lastListed.date ? ` · ${sum.lastListed.date}` : ""}</span>}
          {sum.lastSold && <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200">💵 Last sold: {sum.lastSold.price}{sum.lastSold.date ? ` · ${sum.lastSold.date}` : ""}</span>}
        </div>
      )}

      {/* header */}
      <div className="mb-1 grid grid-cols-[88px_1fr_84px_1fr_20px] items-center gap-1.5 px-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
        <span>Date</span><span>Event</span><span>Price</span><span>Source</span><span />
      </div>
      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[88px_1fr_84px_1fr_20px] items-center gap-1.5">
            <input type="date" value={row.date} onChange={(e) => update(i, "date", e.target.value)} className="min-w-0 rounded border border-slate-200 px-1 py-1 text-[11px]" />
            <input list="listing-events" value={row.event} onChange={(e) => update(i, "event", e.target.value)} placeholder="Event" className="min-w-0 rounded border border-slate-200 px-2 py-1 text-[12px]" />
            <input value={row.price} onChange={(e) => update(i, "price", e.target.value)} placeholder="$" className="min-w-0 rounded border border-slate-200 px-2 py-1 text-[12px]" />
            <input value={row.source} onChange={(e) => update(i, "source", e.target.value)} placeholder="Zillow / MLS / public record" className="min-w-0 rounded border border-slate-200 px-2 py-1 text-[12px]" />
            <button type="button" onClick={() => removeRow(i)} title="Remove row" className="shrink-0 rounded px-1 text-[12px] text-slate-300 hover:bg-rose-50 hover:text-rose-600">✕</button>
          </div>
        ))}
      </div>
      <datalist id="listing-events">{LISTING_EVENTS.map((e) => <option key={e} value={e} />)}</datalist>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={addRow} className="rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:border-brand-navy hover:text-brand-navy">+ Add row</button>
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-brand-navy px-3 py-1 text-[11px] font-bold text-white hover:bg-brand-navy-700 disabled:opacity-50">{saving ? "Saving…" : "Save history"}</button>
      </div>
    </div>
  );
}
