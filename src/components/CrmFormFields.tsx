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
