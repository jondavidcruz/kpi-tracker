"use client";
// GHL-style thread composer: type a message, pick 💬 SMS or ✉️ Email, send.
// Uses the same gated server actions as the lead card (perms enforced there).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendCrmSmsAction, sendCrmEmailAction } from "@/app/crm/actions";

export default function ConvComposer({ contactId, oppId, phone, email, canSms, canEmail }: {
  contactId: string; oppId: string; phone: string; email: string; canSms: boolean; canEmail: boolean;
}) {
  const [mode, setMode] = useState<"sms" | "email">(canSms || !canEmail ? "sms" : "email");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const disabled = mode === "sms" ? !canSms || !phone : !canEmail || !email;

  const send = () => {
    if (!text.trim() || disabled) return;
    const fd = new FormData();
    fd.set("contactId", contactId); fd.set("oppId", oppId);
    if (mode === "sms") { fd.set("to", phone); fd.set("text", text); }
    else { fd.set("to", email); fd.set("subject", subject || "Your property — Freedom Offers"); fd.set("body", text); }
    start(async () => {
      if (mode === "sms") await sendCrmSmsAction(fd); else await sendCrmEmailAction(fd);
      setText(""); setSubject("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-2 border-t border-slate-100 bg-white p-3">
      {mode === "email" && (
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject…" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
      )}
      <div className="flex items-end gap-2">
        <div className="flex shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-200">
          <button onClick={() => setMode("sms")} disabled={!canSms} title={canSms ? "Text message" : "SMS not enabled for you"} className={`px-2.5 py-2 text-xs font-bold ${mode === "sms" ? "bg-brand-navy text-white" : "bg-white text-slate-500"} disabled:opacity-40`}>💬</button>
          <button onClick={() => setMode("email")} disabled={!canEmail} title={canEmail ? "Email" : "Email not enabled for you"} className={`px-2.5 py-2 text-xs font-bold ${mode === "email" ? "bg-brand-navy text-white" : "bg-white text-slate-500"} disabled:opacity-40`}>✉️</button>
        </div>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={1}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && mode === "sms") { e.preventDefault(); send(); } }}
          placeholder={mode === "sms" ? (phone ? `Text ${phone}…` : "No phone on file") : (email ? `Email ${email}…` : "No email on file")}
          className="max-h-32 min-h-[40px] flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
        />
        <button onClick={send} disabled={pending || disabled || !text.trim()} className="rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
          {pending ? "…" : "Send"}
        </button>
      </div>
      {disabled && <div className="text-[11px] text-amber-600">{mode === "sms" ? (!phone ? "This contact has no phone number." : "SMS isn't enabled for you — ask Jon (Comms access on /crm).") : (!email ? "This contact has no email." : "Email isn't enabled for you — ask Jon (Comms access on /crm).")}</div>}
    </div>
  );
}
