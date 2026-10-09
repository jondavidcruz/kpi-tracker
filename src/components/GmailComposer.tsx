"use client";
// Gmail-style compose window (Jon 2026-10-07): dark "New Message" bar,
// To/Subject rules, the rep's signature block shown exactly as it will send
// (set yours on /account — it's appended automatically).
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendCrmEmailAction } from "@/app/crm/actions";
import { GOOGLE_REVIEW_LINK } from "@/lib/crm-shared";

type Snip = { id: string; name: string; kind: string; subject?: string; body: string };

type HistMail = { body: string; inbound: boolean; at: string; actor?: string };

export default function GmailComposer({ oppId, contactId, to, leadName, rep, fromLabel, signature, snippets, history = [] }: {
  oppId: string; contactId: string; to: string; leadName: string; rep: string; fromLabel: string; signature: string; snippets: Snip[]; history?: HistMail[];
}) {
  const allSnips: Snip[] = [
    { id: "__review", name: "⭐ Ask for Google review", kind: "email", subject: "A quick favor, {name}?", body: `Hi {name},\n\nIt was a pleasure working with you! If you have 30 seconds, a quick Google review would mean the world to our small team:\n${GOOGLE_REVIEW_LINK}\n\nThank you!` },
    ...snippets,
  ];
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [undoLeft, setUndoLeft] = useState(0); // Gmail-style send delay
  const undoRef = useRef<{ timer: ReturnType<typeof setInterval> | null; fd: FormData | null }>({ timer: null, fd: null });
  const [pending, start] = useTransition();
  const router = useRouter();
  const first = leadName.split(" ")[0] || "there";

  const reallySend = (fd: FormData) => {
    start(async () => { await sendCrmEmailAction(fd); setSent("✓ Sent"); setTimeout(() => setSent(""), 2500); router.refresh(); });
  };
  const send = () => {
    if (!subject.trim() || !body.trim()) return;
    // first email to this seller → explicit confirmation (Jon 2026-10-07)
    if (history.length === 0 && !confirming) { setConfirming(true); return; }
    setConfirming(false);
    const fd = new FormData();
    fd.set("oppId", oppId); fd.set("contactId", contactId); fd.set("to", to);
    fd.set("subject", subject); fd.set("body", body);
    // 20-second undo window (like Gmail): the email leaves AFTER the countdown
    setSubject(""); setBody("");
    undoRef.current.fd = fd;
    setUndoLeft(20);
    undoRef.current.timer = setInterval(() => {
      setUndoLeft((n) => {
        if (n <= 1) {
          if (undoRef.current.timer) clearInterval(undoRef.current.timer);
          undoRef.current.timer = null;
          if (undoRef.current.fd) { reallySend(undoRef.current.fd); undoRef.current.fd = null; }
          return 0;
        }
        return n - 1;
      });
    }, 1000);
  };
  const undo = () => {
    if (undoRef.current.timer) clearInterval(undoRef.current.timer);
    undoRef.current.timer = null;
    const fd = undoRef.current.fd; undoRef.current.fd = null;
    setUndoLeft(0);
    if (fd) { setSubject(String(fd.get("subject") ?? "")); setBody(String(fd.get("body") ?? "")); }
  };

  return (
    <div className="flex flex-wrap items-start gap-4">
    <div className="min-w-[300px] flex-1 overflow-hidden rounded-xl shadow-md ring-1 ring-slate-200">
      <div className="flex items-center justify-between bg-[#404043] px-4 py-2">
        <span className="text-xs font-semibold text-white">New Message</span>
        {sent && <span className="text-xs font-bold text-emerald-300">{sent}</span>}
      </div>
      <div className="bg-white px-4 pb-3 text-sm">
        {history.length > 0 && (
          <div className="max-h-36 space-y-1 overflow-y-auto border-b border-slate-100 py-2">
            {history.map((m, i) => (
              <div key={i} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-700 ring-1 ring-slate-100">
                <span className={`mr-1 font-bold ${m.inbound ? "text-slate-500" : "text-indigo-500"}`}>{m.inbound ? leadName.split(" ")[0] : (m.actor?.split(" ")[0] || "Us")}:</span>
                <span className="whitespace-pre-line">{m.body}</span>
                <span className="ml-1 text-[9px] text-slate-400">{new Date(m.at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
              </div>
            ))}
          </div>
        )}
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
          {undoLeft > 0 ? (
            <>
              <span className="text-[13px] font-semibold text-slate-600">Sending in {undoLeft}s…</span>
              <button onClick={undo} className="rounded-full bg-amber-500 px-4 py-2 text-[13px] font-bold text-white hover:bg-amber-600">↩️ Undo</button>
            </>
          ) : confirming ? (
            <>
              <span className="text-[12px] font-bold text-amber-700">First email to {first} — send it?</span>
              <button onClick={send} className="rounded-full bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-emerald-700">✓ Yes, send email</button>
              <button onClick={() => setConfirming(false)} className="rounded-full bg-slate-100 px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-200">Cancel</button>
            </>
          ) : (
            <button onClick={send} disabled={pending || !subject.trim() || !body.trim()} className="rounded-full bg-[#0b57d0] px-5 py-2 text-[13px] font-bold text-white hover:bg-[#0a4bb8] disabled:opacity-40">{pending ? "Sending…" : "Send"}</button>
          )}
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

    {/* 💻 how it looks when they open it (MacBook / Apple Mail style) */}
    <div className="mx-auto w-[340px] shrink-0 select-none max-xl:hidden">
      <div className="rounded-xl bg-slate-800 p-2 shadow-xl">
        <div className="overflow-hidden rounded-lg bg-white">
          <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-2 text-[10px] font-semibold text-slate-400">Inbox — {to || "seller"}</span>
          </div>
          <div className="border-b border-slate-100 px-3 py-2">
            <div className="text-[12px] font-bold text-slate-900">{subject || <span className="text-slate-300">(subject)</span>}</div>
            <div className="mt-0.5 text-[10px] text-slate-500">{fromLabel}</div>
            <div className="text-[10px] text-slate-400">To: {leadName} · today</div>
          </div>
          <div className="h-[380px] overflow-y-auto px-3 py-2">
            <div className="whitespace-pre-line text-[11px] leading-relaxed text-slate-800">{body || <span className="text-slate-300">start typing to preview…</span>}</div>
            {body && <div className="mt-3 whitespace-pre-line border-t border-slate-100 pt-2 text-[10px] leading-snug text-slate-500">{signature}</div>}
          </div>
        </div>
      </div>
      <div className="mt-1 text-center text-[9px] text-slate-400">how it looks on {first}&apos;s computer</div>
    </div>
    </div>
  );
}