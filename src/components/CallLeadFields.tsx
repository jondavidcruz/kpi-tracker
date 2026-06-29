"use client";

import { useState } from "react";

type CallType = { key: string; label: string; group: string; hasScript: boolean };

/** Rep + call-type pickers plus the contact fields, which relabel based on who
 *  the call is with: Acquisitions → seller; Dispositions → buyer / developer. */
export default function CallLeadFields({ inputCls, reps, types, groups }: { inputCls: string; reps: string[]; types: CallType[]; groups: string[] }) {
  // Multiple types can be picked — one recording sometimes contains several calls.
  const [callTypes, setCallTypes] = useState<string[]>([]);
  const [direction, setDirection] = useState<"outbound" | "inbound">("outbound");
  const dispo = callTypes.some((k) => types.find((t) => t.key === k)?.group === "Dispositions");
  const L = dispo
    ? { addr: "Property / deal", addrP: "123 Main St or deal name…", name: "Buyer / developer name", nameP: "Acme Capital · John Buyer", phone: "Phone / company (callback)", phoneP: "(555) 123-4567" }
    : { addr: "Property address (which lead)", addrP: "123 Main St…", name: "Seller name", nameP: "Jane Seller", phone: "Seller phone (callback)", phoneP: "(555) 123-4567" };

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-slate-500">Direction:</span>
        {(["outbound", "inbound"] as const).map((d) => (
          <button key={d} type="button" onClick={() => setDirection(d)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${direction === d ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {d === "outbound" ? "📤 Outbound" : "📥 Inbound"}
          </button>
        ))}
        <input type="hidden" name="direction" value={direction} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="sm:col-span-1">
          <span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Whose call?</span>
          <select name="repName" className={inputCls} defaultValue="">
            <option value="">Pick a rep…</option>
            {reps.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <div className="sm:col-span-2">
          <span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Call type(s) — check all that apply</span>
          <div className="rounded-lg border border-slate-300 p-2.5">
            {groups.map((g) => (
              <div key={g} className="mb-2 last:mb-0">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{g}</div>
                <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
                  {types.filter((c) => c.group === g).map((c) => {
                    const on = callTypes.includes(c.key);
                    return (
                      <label key={c.key} className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[13px] ${on ? "bg-sky-50 font-semibold text-sky-800" : "text-slate-600 hover:bg-slate-50"}`}>
                        <input type="checkbox" name="callType" value={c.key} checked={on} onChange={(e) => setCallTypes((prev) => (e.target.checked ? [...prev, c.key] : prev.filter((k) => k !== c.key)))} className="h-3.5 w-3.5 accent-sky-600" />
                        {c.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <span className="mt-0.5 block text-[11px] text-slate-400">Check every type this recording covers — it&apos;ll be scored against each.</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label><span className="mb-0.5 block text-[11px] font-semibold text-slate-500">{L.addr}</span><input name="address" placeholder={L.addrP} className={inputCls} /></label>
        <label><span className="mb-0.5 block text-[11px] font-semibold text-slate-500">{L.name}</span><input name="sellerName" placeholder={L.nameP} className={inputCls} /></label>
        <label><span className="mb-0.5 block text-[11px] font-semibold text-slate-500">{L.phone}</span><input name="sellerPhone" type="tel" placeholder={L.phoneP} className={inputCls} /></label>
      </div>
      {dispo && <p className="-mt-1 text-[11px] text-slate-400">Dispositions calls are buyer / developer conversations. (Sharyn talks to sellers only for a reduction or a weekly deal update.)</p>}
    </>
  );
}
