"use client";
// 🧩 Controlled form fields for a CRM form section (Home / Land / Discovery / buy-box).
// Replaces the old uncontrolled <AutoSaveForm> rendering where React 19 reset the form after
// each server action and BLANKED the dropdowns — so a rep's select choices (road access,
// flood zone, topography…) looked like they "never saved / always reset" (Jon 2026-10-26).
// Here every field is controlled by local state, so its value can never be reset out from
// under the rep; changes save themselves on a short debounce.
import { useRef, useState, useTransition } from "react";
import { saveCrmFormAction } from "@/app/crm/actions";
import type { CrmForm } from "@/lib/crm-forms";
import { parseLooseMoney, fmtDollars } from "@/lib/money";

const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm";
const labelCls = "mb-0.5 block text-[11px] font-bold text-slate-500";

export default function CrmFormFields({ form, oppId, contactId, initial, onSaved }: {
  form: CrmForm; oppId: string; contactId: string; initial: Record<string, string | string[]>; onSaved?: () => void;
}) {
  const [vals, setVals] = useState<Record<string, string | string[]>>(initial ?? {});
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = (next: Record<string, string | string[]>) => {
    const fd = new FormData();
    fd.set("oppId", oppId); fd.set("contactId", contactId); fd.set("formKey", form.key);
    for (const [k, v] of Object.entries(next)) {
      if (Array.isArray(v)) v.forEach((x) => fd.append(`f_${k}`, x));
      else if (v) fd.set(`f_${k}`, v);
    }
    setStatus("saving");
    start(async () => { await saveCrmFormAction(fd); setStatus("saved"); onSaved?.(); });
  };
  const change = (k: string, v: string | string[]) => {
    const next = { ...vals, [k]: v };
    setVals(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), 700);
  };
  const toggleCheck = (k: string, opt: string, on: boolean) => {
    const cur = Array.isArray(vals[k]) ? [...(vals[k] as string[])] : [];
    change(k, on ? [...new Set([...cur, opt])] : cur.filter((x) => x !== opt));
  };

  return (
    <div className="space-y-3">
      <div className="text-sm font-extrabold text-slate-800">{form.emoji} {form.name}</div>
      {form.fields.map((fld) => {
        const cur = vals[fld.key];
        if (fld.type === "select") return (
          <div key={fld.key}>
            <label className={labelCls}>{fld.label}</label>
            <select value={typeof cur === "string" ? cur : ""} onChange={(e) => change(fld.key, e.target.value)} className={inputCls}>
              <option value="">—</option>
              {fld.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        );
        if (fld.type === "checks") return (
          <div key={fld.key}>
            <label className={labelCls}>{fld.label}</label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {fld.options.map((o) => (
                <label key={o} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-700 ring-1 ring-slate-100">
                  <input type="checkbox" checked={Array.isArray(cur) && cur.includes(o)} onChange={(e) => toggleCheck(fld.key, o, e.target.checked)} />
                  {o}
                </label>
              ))}
            </div>
          </div>
        );
        if (fld.type === "textarea") return (
          <div key={fld.key}>
            <label className={labelCls}>{fld.label}</label>
            <textarea value={typeof cur === "string" ? cur : ""} onChange={(e) => change(fld.key, e.target.value)} rows={2} placeholder={fld.hint ?? ""} className={inputCls} />
          </div>
        );
        // 💵 Always-$-formatted amount: type 13k / $13,000 / 13000, reformats to $13,000 on blur.
        if (fld.type === "money") return (
          <div key={fld.key}>
            <label className={labelCls}>{fld.label}</label>
            <input value={typeof cur === "string" ? cur : ""} inputMode="decimal" placeholder="$0"
              onChange={(e) => change(fld.key, e.target.value)}
              onBlur={(e) => { const n = parseLooseMoney(e.target.value); if (n != null) change(fld.key, fmtDollars(n)); }}
              className={inputCls} />
            {fld.hint && <p className="mt-0.5 text-[10px] text-slate-400">{fld.hint}</p>}
          </div>
        );
        // 💵– One range field, low → high, both $-formatted on blur. Stores two keys.
        if (fld.type === "moneyrange") {
          const lo = typeof vals[fld.keyLow] === "string" ? (vals[fld.keyLow] as string) : "";
          const hi = typeof vals[fld.keyHigh] === "string" ? (vals[fld.keyHigh] as string) : "";
          const fmt = (k: string) => (e: React.FocusEvent<HTMLInputElement>) => { const n = parseLooseMoney(e.target.value); if (n != null) change(k, fmtDollars(n)); };
          return (
            <div key={fld.key}>
              <label className={labelCls}>{fld.label}</label>
              <div className="flex items-center gap-2">
                <input value={lo} inputMode="decimal" placeholder="$ low" onChange={(e) => change(fld.keyLow, e.target.value)} onBlur={fmt(fld.keyLow)} className={inputCls} />
                <span className="shrink-0 font-bold text-slate-400">→</span>
                <input value={hi} inputMode="decimal" placeholder="$ high" onChange={(e) => change(fld.keyHigh, e.target.value)} onBlur={fmt(fld.keyHigh)} className={inputCls} />
              </div>
              {fld.hint && <p className="mt-0.5 text-[10px] text-slate-400">{fld.hint}</p>}
            </div>
          );
        }
        return (
          <div key={fld.key}>
            <label className={labelCls}>{fld.label}</label>
            <input value={typeof cur === "string" ? cur : ""} onChange={(e) => change(fld.key, e.target.value)} placeholder={fld.hint ?? ""} className={inputCls} />
          </div>
        );
      })}
      <div className="h-3 text-[10px] font-semibold">
        {status === "saving" && <span className="text-sky-500">saving…</span>}
        {status === "saved" && <span className="text-emerald-600">✓ saved automatically</span>}
      </div>
    </div>
  );
}
