"use client";
// 📨 Start/stop an automated follow-up sequence on a lead (Jon 2026-10-29). Enrollment is
// manual (you pick who). Each step drops a ready-to-send task for the rep/VA (or auto-sends
// when DRIP_SEND=1). Any reply stops it automatically.
import { useTransition } from "react";
import { enrollDripAction, stopDripAction } from "@/app/crm/actions";

type Drip = { seq?: string; step?: number; nextAt?: string } | null;

export default function DripControl({ oppId, contactId, drip, onChanged }: { oppId: string; contactId: string; drip: Drip; onChanged?: () => void }) {
  const [pending, start] = useTransition();
  const run = (fn: (fd: FormData) => Promise<unknown>) => {
    const fd = new FormData(); fd.set("oppId", oppId); fd.set("contactId", contactId); fd.set("seq", "seller_land");
    start(async () => { await fn(fd); onChanged?.(); });
  };
  if (drip?.seq) {
    return (
      <div className="col-span-2 flex flex-wrap items-center gap-2 rounded-lg bg-sky-50/70 px-2.5 py-1.5 text-[12px] ring-1 ring-sky-100">
        <span className="font-bold text-sky-800">📨 Follow-up sequence active</span>
        <span className="text-slate-500">step {(drip.step ?? 0) + 1}{drip.nextAt ? ` · next ${drip.nextAt}` : ""}</span>
        <button type="button" disabled={pending} onClick={() => run(stopDripAction)} className="ml-auto rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-red-500 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">{pending ? "…" : "Stop"}</button>
      </div>
    );
  }
  return (
    <div className="col-span-2">
      <button type="button" disabled={pending} onClick={() => run(enrollDripAction)} className="rounded-lg bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-200 disabled:opacity-50" title="Enroll this lead in the land seller follow-up sequence (6 touches over ~30 days). Each step drops a ready-to-send task; any reply stops it.">{pending ? "Starting…" : "📨 Start follow-up sequence"}</button>
    </div>
  );
}
