"use client";

import { useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Assignment or novation for a tired 3/2 the seller wants gone fast?",
  "ARV 350k, full gut 1,400 sf, mid-tier market — what's my MAO?",
  "Estimate repairs for a full cosmetic + new roof, 1,600 sf.",
  "Seller owns free & clear and is flexible — best exit?",
];

export default function UnderwriteBot() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...msgs, { role: "user" as const, content: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/underwrite-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const j = await r.json();
      setMsgs([...next, { role: "assistant", content: j.reply ?? "No answer." }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "Couldn't reach the assistant. Try again." }]);
    } finally {
      setBusy(false);
      setTimeout(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight }), 50);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="text-lg">🤖</span>
        <span className="text-sm font-bold text-slate-800">Underwriting Assistant</span>
        <span className="text-xs text-slate-400">— ask it to pick the exit, size the offer, or estimate repairs</span>
        <span className="ml-auto text-slate-400">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 p-4">
          <div ref={scroller} className="max-h-80 space-y-3 overflow-y-auto">
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">Trained on the Freedom Offers playbook (market tiers, MAO math, rehab $/sf, novation vs assignment). Try:</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-800"}`}>{m.content}</div>
              </div>
            ))}
            {busy && <div className="flex justify-start"><div className="rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-400">Thinking…</div></div>}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mt-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a deal…"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
            <button disabled={busy || !input.trim()} className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700 disabled:opacity-40">Send</button>
          </form>
          <p className="mt-1.5 text-[10px] text-slate-400">Estimates and guidance only — verify comps and numbers before making an offer.</p>
        </div>
      )}
    </div>
  );
}
