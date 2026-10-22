"use client";
// 📤 Queue the send of a land lead to its matching cash buyers (Jon 2026-10-20).
// Creates a tracked dispo task with the blast message + buyer contacts (a human
// sends — no auto-outreach). Jon 2026-10-24: a HUMAN must verify the offer packet
// is loaded + accurate BEFORE the blast is armed, so this is now a two-step:
// click → verify packet → arm the send.
import { useActionState, useState } from "react";
import { sendToMatchingBuyersAction } from "@/app/crm/actions";

export default function SendToBuyersButton({ oppId }: { oppId: string }) {
  const [state, action, pending] = useActionState(sendToMatchingBuyersAction, null);
  const [open, setOpen] = useState(false);
  const [verified, setVerified] = useState(false);

  if (state?.ok) return <span className="ml-auto text-[10px] font-bold text-emerald-700">✓ Queued to {state.count} buyer{state.count === 1 ? "" : "s"} — go send it from Tasks (top-down).</span>;

  if (!open) {
    return (
      <span className="ml-auto inline-flex items-center gap-1.5">
        {state && !state.ok && <span className="max-w-[160px] text-[10px] font-semibold text-amber-600">{state.msg}</span>}
        <button onClick={() => setOpen(true)} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700">📤 Send to buyers</button>
      </span>
    );
  }
  return (
    <div className="ml-auto w-full max-w-sm rounded-xl bg-indigo-50 p-2.5 ring-1 ring-indigo-200">
      <div className="text-[11px] font-extrabold text-indigo-900">📤 Before the blast — verify the offer packet</div>
      <p className="mt-0.5 text-[10px] leading-snug text-slate-600">Open the <b>Documents</b> for this deal and confirm the offer packet is <b>loaded and accurate</b> (right address, specs, photos, no asking price / owner name exposed). The blast only arms once you check the box.</p>
      <label className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-indigo-800">
        <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="h-3.5 w-3.5 accent-indigo-600" />
        ✅ The offer packet is loaded and accurate
      </label>
      <div className="mt-2 flex items-center gap-1.5">
        <form action={action}>
          <input type="hidden" name="oppId" value={oppId} />
          <button disabled={!verified || pending} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50" title={verified ? "Queue the send task (a human still sends it)" : "Verify the packet first"}>{pending ? "Arming…" : "📣 Arm the send"}</button>
        </form>
        <button onClick={() => { setOpen(false); setVerified(false); }} className="text-[10px] font-semibold text-slate-400 hover:text-slate-600">cancel</button>
        {state && !state.ok && <span className="text-[10px] font-semibold text-amber-600">{state.msg}</span>}
      </div>
      <p className="mt-1 text-[9px] text-slate-400">Arming creates a tracked task with the ready message + matched buyers. You send the email/SMS from there — nothing goes out automatically.</p>
    </div>
  );
}
