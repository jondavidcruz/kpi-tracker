"use client";
// 📨 Start/stop an automated follow-up sequence on a lead (Jon 2026-10-29; stage-aware
// 2026-11-04). Enrollment is manual (you pick who + which sequence) OR auto-armed when the
// deal hits a matching stage. Each step drops a ready-to-send task for the rep/VA (or
// auto-sends when DRIP_SEND=1). Any reply stops it automatically.
import { useState, useTransition } from "react";
import { enrollDripAction, stopDripAction } from "@/app/crm/actions";

type Drip = { seq?: string; step?: number; nextAt?: string; stageArmed?: boolean } | null;

// Client-safe label map (drip.ts is server-only, so it can't be imported here). Keep the
// keys in sync with DRIP_SEQUENCES in src/lib/drip.ts.
const SEQ_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "seller_land", label: "Seller land — 6 touches / ~30 days" },
  { key: "contract_sent", label: "Contract sent — chase the signature" },
  { key: "offer_negotiate", label: "Offer made / negotiating — keep it warm" },
  { key: "offer_ready", label: "Offer ready — get it in front of them" },
  { key: "ten_days_hell", label: "10 days of hell — intensive close" },
  { key: "ghosted", label: "Ghosted — long re-engagement" },
];
const seqLabel = (key?: string) => SEQ_OPTIONS.find((o) => o.key === key)?.label ?? key ?? "follow-up";

export default function DripControl({ oppId, contactId, drip, onChanged }: { oppId: string; contactId: string; drip: Drip; onChanged?: () => void }) {
  const [pending, start] = useTransition();
  const [pick, setPick] = useState("seller_land");
  const run = (fn: (fd: FormData) => Promise<unknown>, seq: string) => {
    const fd = new FormData(); fd.set("oppId", oppId); fd.set("contactId", contactId); fd.set("seq", seq);
    start(async () => { await fn(fd); onChanged?.(); });
  };
  if (drip?.seq) {
    return (
      <div className="col-span-2 flex flex-wrap items-center gap-2 rounded-lg bg-sky-50/70 px-2.5 py-1.5 text-[12px] ring-1 ring-sky-100">
        <span className="font-bold text-sky-800">📨 {seqLabel(drip.seq)}</span>
        <span className="text-slate-500">step {(drip.step ?? 0) + 1}{drip.nextAt ? ` · next ${drip.nextAt}` : ""}{drip.stageArmed ? " · auto" : ""}</span>
        <button type="button" disabled={pending} onClick={() => run(stopDripAction, drip.seq!)} className="ml-auto rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-red-500 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">{pending ? "…" : "Stop"}</button>
      </div>
    );
  }
  return (
    <div className="col-span-2 flex flex-wrap items-center gap-1.5">
      <select value={pick} onChange={(e) => setPick(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 focus:border-slate-400 focus:outline-none">
        {SEQ_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      <button type="button" disabled={pending} onClick={() => run(enrollDripAction, pick)} className="rounded-lg bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-200 disabled:opacity-50" title="Start this follow-up sequence. Each step drops a ready-to-send task; any reply stops it.">{pending ? "Starting…" : "📨 Start sequence"}</button>
    </div>
  );
}
