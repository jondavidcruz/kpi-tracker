"use client";
// ✨ "Autofill from notes" for Home/Land Details (Jon 2026-10-27). Pulls proposed field
// values from the lead's notes/calls, shows them for review (checkboxes, default on), and
// only fills EMPTY fields on Apply — never overwrites what the rep already entered.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { autofillDetailsFromNotesAction, applyDetailsAutofillAction } from "@/app/crm/actions";

export default function DetailsAutofill({ oppId, formKey, onApplied }: { oppId: string; formKey: "property" | "land"; onApplied?: () => void }) {
  const [pending, start] = useTransition();
  const [proposals, setProposals] = useState<Record<string, string> | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const router = useRouter();

  const fetchProposals = () => {
    setMsg("");
    const fd = new FormData(); fd.set("oppId", oppId); fd.set("formKey", formKey);
    start(async () => {
      const r = await autofillDetailsFromNotesAction(fd);
      if (!r.ok || !r.proposals) { setMsg(r.msg || "Nothing to pull."); setProposals(null); return; }
      setProposals(r.proposals); setLabels(r.labels || {}); setPicked(new Set(Object.keys(r.proposals)));
    });
  };
  const apply = () => {
    if (!proposals) return;
    const vals: Record<string, string> = {};
    for (const k of picked) if (proposals[k]) vals[k] = proposals[k];
    if (!Object.keys(vals).length) { setMsg("Pick at least one field."); return; }
    const fd = new FormData(); fd.set("oppId", oppId); fd.set("formKey", formKey); fd.set("values", JSON.stringify(vals));
    start(async () => {
      const r = await applyDetailsAutofillAction(fd);
      setMsg(r.msg || (r.ok ? "Done." : "Couldn't apply."));
      if (r.ok) { setProposals(null); onApplied?.(); router.refresh(); }
    });
  };
  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={fetchProposals} disabled={pending} className="rounded-lg bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100 disabled:opacity-50">{pending && !proposals ? "✨ Reading notes…" : "✨ Autofill from notes"}</button>
        {msg && <span className="text-[11px] font-semibold text-slate-500">{msg}</span>}
      </div>
      {proposals && (
        <div className="mt-2 rounded-xl bg-violet-50/60 p-2.5 ring-1 ring-violet-100">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-violet-500">From the notes — pick what to fill (empty fields only)</div>
          <div className="space-y-1">
            {Object.entries(proposals).map(([k, v]) => (
              <label key={k} className="flex cursor-pointer items-start gap-2 rounded-lg bg-white px-2 py-1.5 text-[12px] ring-1 ring-slate-100">
                <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(k)} className="mt-0.5" />
                <span><b className="text-slate-700">{labels[k] ?? k}:</b> <span className="text-slate-600">{v}</span></span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <button type="button" onClick={apply} disabled={pending} className="rounded-lg bg-violet-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-violet-700 disabled:opacity-50">{pending ? "Applying…" : `Fill ${picked.size} field${picked.size === 1 ? "" : "s"}`}</button>
            <button type="button" onClick={() => setProposals(null)} className="rounded-lg bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-200">Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}
