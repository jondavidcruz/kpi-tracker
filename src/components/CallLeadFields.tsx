"use client";

import { useState } from "react";

type CallType = { key: string; label: string; group: string; hasScript: boolean };

/** Rep + call-type pickers plus the contact fields, which relabel based on who
 *  the call is with: Acquisitions → seller; Dispositions → buyer / developer. */
export default function CallLeadFields({ inputCls, reps, types, groups }: { inputCls: string; reps: string[]; types: CallType[]; groups: string[] }) {
  const [callType, setCallType] = useState("");
  const selected = types.find((t) => t.key === callType);
  const dispo = selected?.group === "Dispositions";
  const L = dispo
    ? { addr: "Property / deal", addrP: "123 Main St or deal name…", name: "Buyer / developer name", nameP: "Acme Capital · John Buyer", phone: "Phone / company (callback)", phoneP: "(555) 123-4567" }
    : { addr: "Property address (which lead)", addrP: "123 Main St…", name: "Seller name", nameP: "Jane Seller", phone: "Seller phone (callback)", phoneP: "(555) 123-4567" };

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="sm:col-span-1">
          <span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Whose call?</span>
          <select name="repName" className={inputCls} defaultValue="">
            <option value="">Pick a rep…</option>
            {reps.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Call type</span>
          <select name="callType" required className={inputCls} value={callType} onChange={(e) => setCallType(e.target.value)}>
            <option value="" disabled>Pick a call type…</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {types.filter((c) => c.group === g).map((c) => <option key={c.key} value={c.key}>{c.hasScript ? "✓ " : ""}{c.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
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
