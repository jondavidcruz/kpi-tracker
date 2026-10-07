"use client";
// Click-to-call: Telnyx bridge when armed (TELNYX_CONNECTION_ID set), tel:
// fallback always. The bridge rings the REP's phone first, then connects the
// seller — so calls come from our Telnyx number, and log themselves.
import { useState, useTransition } from "react";
import { telnyxCallAction } from "@/app/crm/actions";

export default function TelnyxCallButton({ oppId, contactId, phone }: { oppId: string; contactId: string; phone: string }) {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  if (!phone) return null;
  const call = () => {
    const repPhone = localStorage.getItem("fo_rep_phone") || window.prompt("Your phone number (the bridge rings YOU first — saved on this device):") || "";
    if (repPhone) localStorage.setItem("fo_rep_phone", repPhone);
    const fd = new FormData();
    fd.set("oppId", oppId);
    fd.set("contactId", contactId);
    fd.set("to", phone);
    fd.set("repPhone", repPhone);
    start(async () => {
      const r = await telnyxCallAction(fd);
      setMsg(r.msg);
    });
  };
  return (
    <span className="flex items-center gap-1.5">
      <button onClick={call} disabled={pending} title="Telnyx bridge: rings your phone, then connects the seller — the call logs itself on the timeline" className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
        {pending ? "⏳ dialing…" : "📞 Call — Telnyx"}
      </button>
      <a href={`tel:${phone}`} title="Plain dial from this device" className="rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200">📱</a>
      {msg && <span className="max-w-[260px] text-[10px] font-semibold text-amber-700">{msg}</span>}
    </span>
  );
}
