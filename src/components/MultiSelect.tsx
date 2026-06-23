"use client";

import { useState } from "react";

// Chip multi-select — a buyer can match several deal/build/property types at once.
// Stores the picks as a comma-joined string in a hidden input under `name`.
export default function MultiSelect({ name, label, options, defaultValue, labelCls }: {
  name: string; label: string; options: string[]; defaultValue: string; labelCls?: string;
}) {
  const initial = (defaultValue || "").split(",").map((s) => s.trim()).filter(Boolean);
  const [sel, setSel] = useState<string[]>(initial);
  const toggle = (o: string) => setSel((s) => s.includes(o) ? s.filter((x) => x !== o) : [...s, o]);
  return (
    <label className="block">
      <span className={labelCls ?? "mb-0.5 block text-[10px] font-semibold text-slate-500"}>{label}{sel.length > 1 ? ` · ${sel.length}` : ""}</span>
      <input type="hidden" name={name} value={sel.join(", ")} />
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button type="button" key={o} onClick={() => toggle(o)}
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${sel.includes(o) ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {o}
          </button>
        ))}
      </div>
    </label>
  );
}
