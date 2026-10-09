"use client";
// 🔔 Inbox bell v3 (Jon 2026-10-09): click a thread → an actual iPhone opens
// RIGHT THERE showing the unread text in the bubbles, you type in the phone's
// own message bar and send from it, with a from-number picker above. "Open
// Conversations" stays as the deeper dive. Soft two-tone ding on NEW texts
// only; never on load, never twice.
import { useEffect, useRef, useState, useTransition } from "react";
import { sendCrmSmsAction } from "@/app/crm/actions";

type Thread = { id: string; name: string; phone: string; owner: string; snippet: string; at: string };
type QuickThread = { id: string; name: string; phone: string; oppId: string; history: Array<{ body: string; inbound: boolean; at: string }>; me: string };

function fmtPhone(n: string) {
  const d = n.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n;
}

// 📱 the iPhone itself — thread bubbles + a real send bar inside the frame
function PhoneQuickReply({ t, onSent }: { t: QuickThread; onSent: () => void }) {
  const [text, setText] = useState("");
  const [from, setFrom] = useState("");
  const [numbers, setNumbers] = useState<string[]>([]);
  const [msgs, setMsgs] = useState(t.history);
  const [pending, start] = useTransition();
  const threadRef = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [msgs.length]);
  useEffect(() => {
    fetch("/api/crm/phone").then(async (r) => {
      if (!r.ok) return;
      const j = (await r.json()) as { numbers?: string[] };
      if (j.numbers?.length) setNumbers(j.numbers);
    }).catch(() => {});
  }, []);
  const first = t.name.split(" ")[0] || "them";
  const send = () => {
    const body = text.trim();
    if (!body || pending) return;
    const fd = new FormData();
    fd.set("oppId", t.oppId); fd.set("contactId", t.id); fd.set("to", t.phone); fd.set("text", body);
    if (from) fd.set("from", from);
    start(async () => {
      await sendCrmSmsAction(fd);
      setMsgs((m) => [...m, { body, inbound: false, at: new Date().toISOString() }]);
      setText("");
      onSent();
    });
  };
  return (
    <span className="block">
      {numbers.length > 0 && (
        <span className="mb-1.5 flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-500">
          Texting from
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold">
            <option value="">Default line</option>
            {numbers.map((n) => <option key={n} value={n}>{fmtPhone(n)}</option>)}
          </select>
        </span>
      )}
      <span className="mx-auto block w-[250px] rounded-[2.4rem] bg-slate-900 p-2 shadow-xl">
        <span className="block overflow-hidden rounded-[1.9rem] bg-white">
          <span className="flex items-center justify-between px-5 pt-2 text-[9px] font-bold text-slate-900"><span>9:41</span><span>📶 🔋</span></span>
          <span className="block border-b border-slate-100 pb-2 pt-1 text-center">
            <span className="mx-auto grid h-8 w-8 place-items-center rounded-full bg-slate-300 text-[11px] font-bold text-white">{(t.name[0] ?? "?").toUpperCase()}</span>
            <span className="mt-0.5 block text-[10px] font-semibold text-slate-800">{first} · {fmtPhone(t.phone)}</span>
          </span>
          <span ref={threadRef} className="flex h-[280px] flex-col gap-1 overflow-y-auto bg-white px-2.5 pb-2 pt-1">
            <span className="mt-auto" />
            <span className="block text-center text-[8px] font-semibold text-slate-400">Text Message · SMS</span>
            {msgs.map((m, i) => (
              <span key={i} className={`flex ${m.inbound ? "justify-start" : "justify-end"}`}>
                <span className="max-w-[80%] whitespace-pre-line break-words rounded-2xl px-2.5 py-1.5 text-[11px] leading-snug" style={m.inbound ? { backgroundColor: "#e9e9eb", color: "#111", borderBottomLeftRadius: 4 } : { backgroundColor: "#34c759", color: "#fff", borderBottomRightRadius: 4 }}>{m.body}</span>
              </span>
            ))}
          </span>
          <span className="flex items-center gap-1.5 border-t border-slate-100 px-2 py-1.5">
            <input
              value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={`Text ${first}…`}
              className="h-7 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 text-[11px] outline-none focus:border-sky-300"
            />
            <button onClick={send} disabled={pending || !text.trim()} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold disabled:opacity-40" style={{ backgroundColor: "#34c759", color: "#fff" }}>{pending ? "…" : "↑"}</button>
          </span>
        </span>
      </span>
    </span>
  );
}

export default function InboxBell() {
  const [count, setCount] = useState(0);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [quick, setQuick] = useState<QuickThread | null>(null);
  const prevRef = useRef<number | null>(null);
  const mutedRef = useRef(false);

  const ding = () => {
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      gain.connect(ctx.destination);
      for (const [f, t] of [[880, 0], [1175, 0.12]] as const) {
        const o = ctx.createOscillator();
        o.type = "sine"; o.frequency.value = f;
        o.connect(gain); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.35);
      }
      setTimeout(() => ctx.close().catch(() => {}), 800);
    } catch { /* badge still updates */ }
  };

  const poll = async () => {
    try {
      const r = await fetch("/api/crm/unread", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { count: number; threads: Thread[] };
      setCount(j.count); setThreads(j.threads ?? []);
      if (prevRef.current !== null && j.count > prevRef.current && !mutedRef.current) ding();
      prevRef.current = j.count;
      document.title = document.title.replace(/^\(\d+\) /, "");
      if (j.count > 0) document.title = `(${j.count}) ${document.title}`;
    } catch { /* next tick */ }
  };

  useEffect(() => {
    try { if (localStorage.getItem("fo_bell_muted") === "1") { setMuted(true); mutedRef.current = true; } } catch { /* on */ }
    poll();
    const t = setInterval(poll, 45_000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = () => {
    const next = !muted;
    setMuted(next); mutedRef.current = next;
    try { localStorage.setItem("fo_bell_muted", next ? "1" : "0"); } catch { /* fine */ }
  };
  const markAll = async () => {
    await fetch("/api/crm/unread", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "readall" }) }).catch(() => {});
    setCount(0); setThreads([]); prevRef.current = 0;
    document.title = document.title.replace(/^\(\d+\) /, "");
  };
  // 📱 quick-text right in the panel (Jon 2026-10-09): clicking a thread
  // opens the iPhone composer inline — fire a reply without leaving the page.
  const openThread = async (id: string) => {
    try {
      const r = await fetch(`/api/crm/unread?thread=${id}`, { cache: "no-store" });
      if (!r.ok) return;
      setQuick((await r.json()) as QuickThread);
      setCount((c) => Math.max(0, c - 1));
      setThreads((ts) => ts.filter((t) => t.id !== id));
    } catch { /* fall back to nothing */ }
  };

  return (
    <span className="fixed right-16 top-3 z-50">
      <button onClick={() => setOpen((v) => !v)} title="Texts waiting on a reply — click to open"
        className="relative grid h-10 w-10 place-items-center rounded-full bg-white text-base shadow-lg ring-1 ring-slate-200 hover:bg-slate-50">
        {muted ? "🔕" : "🔔"}
        {count > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-0.5 text-[9px] font-extrabold text-white">{count}</span>}
      </button>
      {open && quick && (
        <span className="absolute right-0 top-12 flex w-[310px] max-w-[92vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
          <span className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2.5">
            <button onClick={() => setQuick(null)} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200">← back</button>
            <span className="text-[13px] font-extrabold text-slate-800">💬 {quick.name}</span>
            <a href={`/crm/conversations?c=${quick.id}`} className="ml-auto rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-indigo-700 hover:bg-slate-200">full thread ↗</a>
            <button onClick={() => { setQuick(null); setOpen(false); }} className="text-slate-300 hover:text-slate-500">✕</button>
          </span>
          <span className="block p-3">
            <PhoneQuickReply key={quick.id} t={quick} onSent={() => {}} />
          </span>
        </span>
      )}
      {open && !quick && (
        <span className="absolute right-0 top-12 flex w-[320px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
          <span className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2.5">
            <span className="text-[13px] font-extrabold text-slate-800">💬 Unread texts</span>
            <span className="ml-auto flex gap-1.5">
              {count > 0 && <button onClick={markAll} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200">✓ mark all read</button>}
              <button onClick={toggleMute} title={muted ? "Chime is off" : "Chime is on"} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200">{muted ? "🔕 unmute" : "🔔 mute"}</button>
              <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-slate-500">✕</button>
            </span>
          </span>
          {threads.length === 0 ? (
            <span className="px-4 py-6 text-center text-xs text-slate-400">Inbox zero — nothing waiting. 🎉</span>
          ) : (
            threads.map((t) => (
              <button key={t.id} onClick={() => openThread(t.id)} className="flex items-start gap-2.5 border-b border-slate-50 px-3.5 py-2.5 text-left hover:bg-sky-50/60">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-navy text-[10px] font-bold text-white">{(t.name[0] ?? "?").toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] font-bold text-slate-800">{t.name}</span>
                    <span className="shrink-0 text-[9px] text-slate-400">{t.owner}</span>
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">{t.snippet}</span>
                </span>
              </button>
            ))
          )}
          <a href="/crm/conversations" className="bg-slate-50 px-3.5 py-2 text-center text-[11px] font-bold text-indigo-700 hover:bg-slate-100">Open Conversations →</a>
        </span>
      )}
    </span>
  );
}
