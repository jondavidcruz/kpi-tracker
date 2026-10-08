"use client";
// Gmail-style compose window (Jon 2026-10-07): dark "New Message" bar,
// To/Subject rules, the rep's signature block shown exactly as it will send
// (set yours on /account — it's appended automatically).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendCrmEmailAction } from "@/app/crm/actions";
import { GOOGLE_REVIEW_LINK } from "@/lib/crm-shared";

type Snip = { id: string; name: string; kind: string; subject?: string; body: string };

export default function GmailComposer({ oppId, contactId, to, leadName, rep, fromLabel, signature, snippets }: {
  oppId: string; contactId: string; to: string; leadName: string; rep: string; fromLabel: string; signature: string; snippets: Snip[];
}) {
  const allSnips: Snip[] = [
    { id: "__review", name: "⭐ Ask for Google review", kind: "email", subject: "A quick favor, {name}?", body: `Hi {name},\n\nIt was a pleasure working with you! If you have 30 seconds, a quick Google review would mean the world to our small team:\n${GOOGLE_REVIEW_LINK}\n\nThank you!` },
    ...snippets,
  ];
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const first = leadName.split(" ")[0] || "there";

  const send = () => {
    if (!subject.trim() || !body.trim()) return;
    const fd = new FormData();
    fd.set("oppId", oppId); fd.set("contactId", contactId); fd.set("to", to);
    fd.set("subject", subject); fd.set("body", body);
    start(async () => { await sendCrmEmailAction(fd); setSubject(""); setBody(""); setSent("✓ Sent"); setTimeout(() => setSent(""), 2500); router.refresh(); });
  };

  return (
    <div className="overflow-hidden rounded-xl shadow-md ring-1 ring-slate-200">
      <div className="flex items-center justify-between bg-[#404043] px-4 py-2">
        <span className="text-xs font-semibold text-white">New Message</span>
        {sent && <span className="text-xs font-bold text-emerald-300">{sent}</span>}
      </div>
      <div className="bg-white px-4 pb-3 text-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 py-1.5 text-[13px]">
          <span className="text-slate-400">From</span>
          <span className="truncate text-slate-700">{fromLabel}</span>
        </div>
        <div className="flex items-center gap-2 border-b border-slate-100 py-1.5 text-[13px]">
          <span className="text-slate-400">To</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{leadName} &lt;{to}&gt;</span>
        </div>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full border-b border-slate-100 py-1.5 text-[13px] font-semibold outline-none placeholder:font-normal placeholder:text-slate-400" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder={`Hi ${first},`} className="w-full resize-y py-2 text-[13px] leading-relaxed outline-none placeholder:text-slate-300" />
        <div className="border-t border-slate-100 pt-2 text-[12px] leading-snug text-slate-500">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-300">signature — added automatically (edit yours on /account)</div>
          <div className="whitespace-pre-line">{signature}</div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button onClick={send} disabled={pending || !subject.trim() || !body.trim()} className="rounded-full bg-[#0b57d0] px-5 py-2 text-[13px] font-bold text-white hover:bg-[#0a4bb8] disabled:opacity-40">{pending ? "Sending…" : "Send"}</button>
          {allSnips.length > 0 && (
            <select defaultValue="" onChange={(e) => { const s = allSnips.find((x) => x.id === e.target.value); if (s) { setBody(s.body.replaceAll("{name}", first).replaceAll("{rep}", rep.split(" ")[0] || "us")); if (s.subject) setSubject(s.subject.replaceAll("{name}", first)); } e.target.value = ""; }} className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-bold text-slate-500">
              <option value="">📋 snippet…</option>
              {allSnips.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <span className="ml-auto text-[10px] text-slate-400">replies go to your real inbox</span>
        </div>
      </div>
    </div>
  );
}
