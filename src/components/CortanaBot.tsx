"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { topicFor, genericTopic } from "./PageHelp";

type Msg = { role: "user" | "assistant"; content: string };

// Formats the page tutorial as a Cortana chat message (instant — no AI call).
function helpMessage(path: string): string {
  const t = topicFor(path) ?? genericTopic(path);
  const steps = t.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `📖 How to use ${t.title}\n\n${t.intro}\n\n${steps}${t.tip ? `\n\n💡 Tip: ${t.tip}` : ""}\n\nWant more detail on any of these? Just ask.`;
}

// Friendly label + a starter prompt per section, so the suggestions match the
// screen the user is looking at.
function screenHint(path: string): { label: string; prompts: string[] } {
  const p = (path || "").split("?")[0];
  if (p.startsWith("/timecard")) return { label: "Payroll", prompts: ["Analyze this pay period", "Who worked the most hours?", "Any big gaps between entered and clock hours?"] };
  if (p.startsWith("/internet")) return { label: "Internet Speed", prompts: ["Who's below the 50 Mbps goal?", "Whose speed is trending down?"] };
  if (p.startsWith("/underwriting")) return { label: "Underwriting", prompts: ["Which exit should I use for a distressed house?", "How do I calculate the cash MAO?"] };
  if (p.startsWith("/schedule")) return { label: "Schedule & Time", prompts: ["Who's online right now?", "How does the time card work?"] };
  if (p.startsWith("/deals")) return { label: "Deals", prompts: ["How should I work an aging deal?"] };
  if (p.startsWith("/alerts")) return { label: "Alerts", prompts: ["What still needs a justification today?"] };
  if (p.startsWith("/dashboard") || p === "/") return { label: "Dashboard", prompts: ["Who hasn't logged KPIs today?", "What should the team focus on?"] };
  return { label: "War Room", prompts: ["How do I use this section?", "Give me a quick tour of the War Room"] };
}

export default function CortanaBot() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hint = screenHint(path);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy, open]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...msgs, { role: "user" as const, content: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, path }),
      });
      const d = await r.json();
      setMsgs((m) => [...m, { role: "assistant", content: d.reply ?? "Sorry — try again." }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "I couldn't reach the server. Try again." }]);
    } finally {
      setBusy(false);
    }
  }

  function showHelp() {
    setOpen(true);
    setMsgs((m) => [...m, { role: "assistant", content: helpMessage(path) }]);
  }

  return (
    <>
      {/* Launcher — glowing Cortana orb, bottom-right, on every page */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Cortana assistant"
          className="group fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 shadow-xl ring-1 ring-cyan-400/40 transition hover:scale-105"
          style={{ boxShadow: "0 0 22px 2px rgba(34,211,238,0.45)" }}
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-cyan-400/15" />
          <CortanaMark className="h-7 w-7" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[min(560px,80vh)] w-[min(380px,92vw)] flex-col overflow-hidden rounded-2xl bg-slate-900 text-slate-100 shadow-2xl ring-1 ring-cyan-400/30"
          style={{ boxShadow: "0 0 30px 2px rgba(34,211,238,0.25)" }}>
          {/* Header */}
          <div className="flex items-center gap-2.5 border-b border-white/10 bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 ring-1 ring-cyan-400/50">
              <CortanaMark className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold tracking-wide text-cyan-300">CORTANA</div>
              <div className="truncate text-[11px] text-slate-400">War Room assistant · looking at {hint.label}</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Minimize" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/5 hover:text-white">▾</button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-xl bg-slate-800/70 p-3 text-sm leading-relaxed text-slate-200 ring-1 ring-white/5">
                  Hi {""}— I&apos;m <span className="font-semibold text-cyan-300">Cortana</span>. I can explain any part of the War Room and analyze whatever screen you&apos;re on. You&apos;re looking at <span className="font-semibold text-cyan-300">{hint.label}</span> — ask me anything.
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={showHelp} className="rounded-full bg-cyan-500/15 px-3 py-1.5 text-[11px] font-semibold text-cyan-200 ring-1 ring-cyan-400/40 hover:bg-cyan-500/25">📖 How to use this page</button>
                  {hint.prompts.map((p) => (
                    <button key={p} onClick={() => send(p)} className="rounded-full bg-slate-800 px-3 py-1.5 text-[11px] font-medium text-cyan-200 ring-1 ring-cyan-400/20 hover:bg-slate-700">{p}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "bg-cyan-500 text-slate-900" : "bg-slate-800/80 text-slate-100 ring-1 ring-white/5"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-slate-800/80 px-3 py-2 text-sm text-slate-400 ring-1 ring-white/5">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400" style={{ animationDelay: "120ms" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400" style={{ animationDelay: "240ms" }} />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quick help — always available */}
          {msgs.length > 0 && (
            <button onClick={showHelp} className="border-t border-white/10 bg-slate-900 px-3 py-1.5 text-left text-[11px] font-semibold text-cyan-300 hover:bg-slate-800">📖 How to use this page</button>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex items-end gap-2 border-t border-white/10 bg-slate-900 px-3 py-2.5"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              rows={1}
              placeholder={`Ask about ${hint.label}…`}
              className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            />
            <button type="submit" disabled={busy || !input.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-500 text-slate-900 transition hover:bg-cyan-400 disabled:opacity-40">➤</button>
          </form>
        </div>
      )}
    </>
  );
}

function CortanaMark({ className }: { className?: string }) {
  // Stylized Cortana-esque mark: concentric rings with a vertical core.
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <defs>
        <linearGradient id="cortG" x1="0" y1="0" x2="24" y2="24">
          <stop offset="0" stopColor="#67e8f9" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <ellipse cx="12" cy="12" rx="5" ry="9.5" stroke="url(#cortG)" strokeWidth="1.4" opacity="0.5" />
      <ellipse cx="12" cy="12" rx="9.5" ry="5" stroke="url(#cortG)" strokeWidth="1.4" opacity="0.5" />
      <line x1="12" y1="3" x2="12" y2="21" stroke="url(#cortG)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
