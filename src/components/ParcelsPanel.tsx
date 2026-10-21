"use client";
// 📦 Parcels on a land deal (Jon 2026-10-21): one seller / one deal can own several
// parcels. Capture each as address + APN in a clean list instead of cramming them
// into the property-address field or spawning separate cards. The first parcel is the
// deal's headline. If the old crammed fields are detected and no list exists yet, one
// click splits them into rows.
import { useState, useTransition } from "react";
import { saveLandParcelsAction } from "@/app/crm/actions";
import { type Parcel, splitCrammedParcels } from "@/lib/crm-shared";

export default function ParcelsPanel({ oppId, parcels, crammedAddress, crammedApn }: {
  oppId: string; parcels: Parcel[]; crammedAddress?: string; crammedApn?: string;
}) {
  const detected = parcels.length === 0 ? splitCrammedParcels(crammedAddress, crammedApn) : [];
  const [rows, setRows] = useState<Parcel[]>(parcels.length ? parcels : detected.length ? detected : [{ address: "", apn: "" }]);
  const [saving, start] = useTransition();
  const [saved, setSaved] = useState("");

  const update = (i: number, field: keyof Parcel, v: string) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [field]: v } : row)));
  const addRow = () => setRows((r) => [...r, { address: "", apn: "" }]);
  const removeRow = (i: number) => setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : r));
  const save = () => {
    const clean = rows.map((r) => ({ address: r.address.trim(), apn: (r.apn ?? "").trim() })).filter((r) => r.address || r.apn);
    const fd = new FormData(); fd.set("oppId", oppId); fd.set("parcels", JSON.stringify(clean));
    start(async () => { await saveLandParcelsAction(fd); setSaved("✓ Saved"); setTimeout(() => setSaved(""), 2500); });
  };

  const count = rows.filter((r) => r.address.trim() || (r.apn ?? "").trim()).length;
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[13px] font-extrabold text-slate-800">📦 Parcels</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{count}</span>
        {parcels.length === 0 && detected.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">split from the old address field — review &amp; save</span>}
        {saved && <span className="ml-auto text-[11px] font-bold text-emerald-600">{saved}</span>}
      </div>
      <p className="mb-2 text-[11px] text-slate-500">One deal, multiple parcels. The first parcel is the deal&apos;s headline address; the rest stay captured here (no more cramming them into one field).</p>
      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-4 shrink-0 text-center text-[10px] font-bold text-slate-400">{i + 1}</span>
            <input value={row.address} onChange={(e) => update(i, "address", e.target.value)} placeholder="Parcel address" className="min-w-0 flex-[2] rounded border border-slate-200 px-2 py-1 text-[12px]" />
            <input value={row.apn ?? ""} onChange={(e) => update(i, "apn", e.target.value)} placeholder="🧭 APN / Parcel #" className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-[12px]" />
            <button type="button" onClick={() => removeRow(i)} title="Remove parcel" className="shrink-0 rounded px-1 text-[12px] text-slate-300 hover:bg-rose-50 hover:text-rose-600">✕</button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={addRow} className="rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:border-brand-navy hover:text-brand-navy">+ Add parcel</button>
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-brand-navy px-3 py-1 text-[11px] font-bold text-white hover:bg-brand-navy-700 disabled:opacity-50">{saving ? "Saving…" : "Save parcels"}</button>
      </div>
    </div>
  );
}
