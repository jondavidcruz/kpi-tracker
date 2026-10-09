"use client";
// One composer, two faces (Jon 2026-10-07): 💬 SMS = iPhone-preview composer,
// ✉️ Email = Gmail-style window. Used in Conversations and the quick view so
// texting/emailing looks identical everywhere.
import { useState } from "react";
import SmsComposer from "@/components/SmsComposer";
import GmailComposer from "@/components/GmailComposer";

type Snip = { id: string; name: string; kind: string; subject?: string; body: string };

type HistMsg = { body: string; inbound: boolean; at: string; actor?: string };

export default function ConvComposerTabs({ contactId, oppId, phone, email, leadName, rep, fromLabel, signature, canSms, canEmail, snippets, smsHistory = [], emailHistory = [] }: {
  contactId: string; oppId: string; phone: string; email: string; leadName: string; rep: string;
  fromLabel: string; signature: string; canSms: boolean; canEmail: boolean; snippets: Snip[];
  smsHistory?: HistMsg[]; emailHistory?: HistMsg[];
}) {
  const smsOk = canSms && !!phone;
  const emailOk = canEmail && !!email;
  const [mode, setMode] = useState<"sms" | "email">(smsOk || !emailOk ? "sms" : "email");
  if (!smsOk && !emailOk) return (
    <div className="border-t border-slate-100 bg-white p-3 text-[11px] text-amber-600">
      {!phone && !email ? "This contact has no phone or email on file." : "Texting/email isn't enabled for you — ask Jon (Comms access on /crm)."}
    </div>
  );
  return (
    <div className="max-h-[70vh] space-y-2 overflow-y-auto border-t border-slate-100 bg-white p-3">
      <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-200" style={{ width: "fit-content" }}>
        <button onClick={() => setMode("sms")} disabled={!smsOk} className={`px-3 py-1.5 text-xs font-bold ${mode === "sms" ? "bg-brand-navy text-white" : "bg-white text-slate-500"} disabled:opacity-40`}>💬 Text</button>
        <button onClick={() => setMode("email")} disabled={!emailOk} className={`px-3 py-1.5 text-xs font-bold ${mode === "email" ? "bg-brand-navy text-white" : "bg-white text-slate-500"} disabled:opacity-40`}>✉️ Email</button>
      </div>
      {mode === "sms" && smsOk && (
        <SmsComposer compact history={smsHistory} oppId={oppId} contactId={contactId} to={phone} leadName={leadName} rep={rep} snippets={snippets.filter((s) => s.kind === "sms")} />
      )}
      {mode === "email" && emailOk && (
        <GmailComposer history={emailHistory} oppId={oppId} contactId={contactId} to={email} leadName={leadName} rep={rep} fromLabel={fromLabel} signature={signature} snippets={snippets.filter((s) => s.kind === "email")} />
      )}
    </div>
  );
}
