"use client";
// 🔔 Inbox bell v2 (Jon 2026-10-09): click it OPEN — see exactly who texted,
// jump straight into their thread to reply (clears that dot), "mark all read"
// to clear everything, and the mute toggle lives inside the panel. Soft
// two-tone ding on NEW texts only; never on load, never twice.
import { useEffect, useRef, useState } from "react";

type Thread = { id: string; name: string; phone: string; owner: string; snippet: string; at: string };

export default function InboxBell() {
  const [count, setCount] = useState(0);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
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
  const openThread = async (id: string) => {
    await fetch("/api/crm/unread", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "read", id }) }).catch(() => {});
    window.location.href = `/crm/conversations?c=${id}`;
  };

  return (
    <span className="fixed right-16 top-3 z-50">
      <button onClick={() => setOpen((v) => !v)} title="Texts waiting on a reply — click to open"
        className="relative grid h-10 w-10 place-items-center rounded-full bg-white text-base shadow-lg ring-1 ring-slate-200 hover:bg-slate-50">
        {muted ? "🔕" : "🔔"}
        {count > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-0.5 text-[9px] font-extrabold text-white">{count}</span>}
      </button>
      {open && (
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
