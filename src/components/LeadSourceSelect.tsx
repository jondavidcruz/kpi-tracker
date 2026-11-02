"use client";
import { useState } from "react";
import { LEAD_SOURCES, leadSourceHint } from "@/lib/lead-source";

/** 📍 Lead-source dropdown with a live one-line explanation under it (e.g. D4D → 60/40 split).
 *  name="leadSource" so it saves via the existing opportunity autosave (formData.__leadSource). */
export default function LeadSourceSelect({
  defaultValue = "",
  selectClassName = "",
  wrapClassName = "",
}: {
  defaultValue?: string;
  selectClassName?: string;
  wrapClassName?: string;
}) {
  const [v, setV] = useState(defaultValue);
  const hint = leadSourceHint(v);
  return (
    <div className={wrapClassName}>
      <select name="leadSource" value={v} onChange={(e) => setV(e.target.value)} className={selectClassName}>
        <option value="">— where was this lead generated? —</option>
        {LEAD_SOURCES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      {hint && (
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          {v === "D4D" ? "💰 " : ""}{hint}
        </p>
      )}
    </div>
  );
}
