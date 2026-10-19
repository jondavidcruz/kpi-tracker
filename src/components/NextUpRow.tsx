"use client";
// ⚡ One row in the "Next Up" acquisitions work queue (Jon 2026-10-13, from the
// CRM-upgrade roadmap: a single prioritized list of who to work next so no lead
// stalls → faster speed-to-lead → deals signed quicker). Buttons dispatch the
// same global events the board uses, so the floating softphone picks them up.
import { titleCase } from "@/lib/crm-shared";

type Props = {
  id: string; contactId: string; name: string; phone: string; address: string;
  reason: string; sub: string; tone: "red" | "amber" | "sky"; canCall: boolean; canSms: boolean;
};

export default function NextUpRow({ id, contactId, name, phone, address, reason, sub, tone, canCall, canSms }: Props) {
  const ring = tone === "red" ? "ring-red-200 bg-red-50/40" : tone === "amber" ? "ring-amber-200 bg-amber-50/40" : "ring-sky-200 bg-sky-50/40";
  const chip = tone === "red" ? "bg-red-100 text-red-700" : tone === "amber" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700";
  return (
    <div className={`flex items-center gap-3 rounded-xl p-3 ring-1 ${ring}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {/* Open the SAME quick-view panel as the pipeline cards (Jon 2026-10-19:
              "make Next Up leads viewable from quick notes") — no full page load. */}
          <button onClick={() => window.dispatchEvent(new CustomEvent("fo-quickview", { detail: { id } }))} className="truncate text-left text-sm font-bold text-slate-800 hover:text-indigo-600 hover:underline">{titleCase(name)}</button>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${chip}`}>{reason}</span>
        </div>
        {address && <div className="truncate text-[11px] text-slate-500">📍 {address}</div>}
        <div className="text-[11px] font-semibold text-slate-400">{sub}{phone ? ` · ${phone.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3")}` : ""}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {canCall && phone && (
          <button onClick={() => window.dispatchEvent(new CustomEvent("fo-call", { detail: { phone, name, oppId: id, contactId } }))} title={`Call ${name}`} className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">📞</button>
        )}
        {canSms && phone && (
          <button onClick={() => window.dispatchEvent(new CustomEvent("fo-quickview", { detail: { id, tab: "sms" } }))} title="Text" className="grid h-9 w-9 place-items-center rounded-lg bg-sky-100 text-sky-700 ring-1 ring-sky-200 hover:bg-sky-200">💬</button>
        )}
        <button onClick={() => window.dispatchEvent(new CustomEvent("fo-quickview", { detail: { id, tab: "notes" } }))} title="Quick notes & activity" className="grid h-9 w-9 place-items-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-200">📝</button>
        <a href={`/crm/${id}`} title="Open full lead" className="grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50">↗</a>
      </div>
    </div>
  );
}
