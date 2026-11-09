"use client";

import { useEffect, useState } from "react";
import { ScrollText, ChevronRight } from "lucide-react";
import { CRM_SCRIPTS } from "@/lib/crm-scripts";

// One script line, styled by its leading marker (mirrors /scripts page conventions).
function Line({ text }: { text: string }) {
  const t = text.trim();
  if (t.startsWith("🎤"))
    return <div className="my-1 rounded-md bg-emerald-50 px-2 py-1.5 text-[12px] leading-snug text-emerald-900 ring-1 ring-emerald-200"><span className="mr-1 font-bold text-emerald-600">Say:</span>{t.replace(/^🎤\s*/, "")}</div>;
  if (t.startsWith("❓"))
    return <p className="mt-1 text-[12px] font-semibold leading-snug text-slate-700">{t}</p>;
  if (t.startsWith("⚠️"))
    return <div className="my-1 rounded-md bg-amber-50 px-2 py-1 text-[11.5px] leading-snug text-amber-800 ring-1 ring-amber-200">{t}</div>;
  if (t.startsWith("💡"))
    return <div className="my-1 rounded-md bg-sky-50 px-2 py-1 text-[11.5px] leading-snug text-sky-800 ring-1 ring-sky-200">{t}</div>;
  if (t.startsWith("→"))
    return <p className="ml-2 py-0.5 text-[11.5px] leading-snug text-slate-500">{t}</p>;
  return <p className="py-0.5 text-[12px] leading-snug text-slate-700">{t}</p>;
}

/** The call-script sidebar shown beside Home/Land Details for acquisitions reps.
 *  Collapsible; the open/closed choice is remembered per device. Its blocks run in
 *  the same order as the form fields, so the rep reads straight down while filling. */
export default function ScriptPanel({ formKey }: { formKey: "property" | "land" }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      const v = localStorage.getItem("fo-crm-script-open");
      if (v === "0") setOpen(false);
    } catch {}
  }, []);
  const toggle = () => setOpen((o) => {
    try { localStorage.setItem("fo-crm-script-open", o ? "0" : "1"); } catch {}
    return !o;
  });

  const blocks = CRM_SCRIPTS[formKey];
  const label = formKey === "land" ? "Land call script" : "Home call script";

  // Collapsed → a compact reopen button so the fields get the full width.
  if (!open) {
    return (
      <button
        onClick={toggle}
        title="Show call script"
        className="mt-3 inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-brand-navy px-2.5 py-1.5 text-white hover:bg-brand-navy-700 lg:sticky lg:top-0 lg:mt-0"
      >
        <ScrollText size={14} />
        <span className="text-[11px] font-bold tracking-wide">Script</span>
      </button>
    );
  }

  return (
    <aside className="mt-3 shrink-0 lg:sticky lg:top-0 lg:mt-0 lg:w-[20rem] lg:self-start">
      <div className="rounded-xl bg-white/80 ring-1 ring-slate-200">
        <div className="flex items-center gap-1.5 rounded-t-xl bg-brand-navy px-3 py-2 text-white">
          <ScrollText size={14} />
          <span className="flex-1 text-[12px] font-bold">{label}</span>
          <button onClick={toggle} title="Hide script" className="rounded p-0.5 hover:bg-white/15"><ChevronRight size={15} /></button>
        </div>
        <div className="max-h-[62vh] space-y-2.5 overflow-y-auto px-3 py-2.5">
          <p className="text-[10.5px] leading-snug text-slate-400">Foundations, not word-for-word — runs in the same order as the fields. Full script on <a href="/scripts" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-navy hover:underline">Scripts ↗</a></p>
          {blocks.map((b, i) => (
            <div key={i} className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
              <h4 className="mb-0.5 text-[11.5px] font-bold leading-snug text-brand-navy">{b.heading}</h4>
              <div>{b.lines.map((l, li) => <Line key={li} text={l} />)}</div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
