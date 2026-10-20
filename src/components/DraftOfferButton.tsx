"use client";
// 📝 Draft a cash / novation offer in PandaDoc with visible feedback (Jon 2026-10-20:
// the button was failing silently when PandaDoc ran out of document credits). Shows a
// spinner, then the PandaDoc link on success or the real error inline.
import { useActionState } from "react";
import { draftOfferAction } from "@/app/crm/actions";

export default function DraftOfferButton({ oppId, kind, label, className }: { oppId: string; kind: "cash" | "novation"; label: string; className: string }) {
  const [state, action, pending] = useActionState(draftOfferAction, null);
  return (
    <span className="inline-flex flex-col gap-1">
      <form action={action}>
        <input type="hidden" name="oppId" value={oppId} />
        <input type="hidden" name="kind" value={kind} />
        <button disabled={pending} className={`${className} disabled:opacity-60`}>{pending ? "Drafting…" : label}</button>
      </form>
      {state && (state.ok
        ? <a href={state.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-emerald-700 hover:underline">✓ Drafted — open in PandaDoc ↗</a>
        : <span className="max-w-[220px] text-[11px] font-semibold text-red-600">⚠️ {state.msg}</span>)}
    </span>
  );
}
