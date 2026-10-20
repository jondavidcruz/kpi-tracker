"use client";
// 📤 Queue the send of a land lead to its matching cash buyers (Jon 2026-10-20).
// Creates a tracked dispo task with the blast message + buyer contacts (a human
// sends — no auto-outreach). Shows the result inline.
import { useActionState } from "react";
import { sendToMatchingBuyersAction } from "@/app/crm/actions";

export default function SendToBuyersButton({ oppId }: { oppId: string }) {
  const [state, action, pending] = useActionState(sendToMatchingBuyersAction, null);
  return (
    <span className="ml-auto inline-flex items-center gap-1.5">
      {state?.ok
        ? <span className="text-[10px] font-bold text-emerald-700">✓ Queued to {state.count} — see Tasks</span>
        : state && !state.ok ? <span className="max-w-[160px] text-[10px] font-semibold text-amber-600">{state.msg}</span> : null}
      <form action={action}>
        <input type="hidden" name="oppId" value={oppId} />
        <button disabled={pending} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-60">{pending ? "Queuing…" : "📤 Send to buyers"}</button>
      </form>
    </span>
  );
}
