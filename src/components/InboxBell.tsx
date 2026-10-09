"use client";
// 🔔 Soft new-text chime (Jon 2026-10-08: "a small bell, not annoying").
// Polls the unread count every 45s; when it RISES, plays one short, quiet
// two-tone ding and shows the count on a tiny bell by the phone. Mutable
// (saved per device), never repeats for the same message, silent on load.
import { useEffect, useRef, useState } from "react";

export default function InboxBell() {
  const [count, setCount] = useState(0);
  const [muted, setMuted] = useState(false);
  const prevRef = useRef<number | null>(null);
  const mutedRef = useRef(false);

  useEffect(() => {
    try { if (localStorage.getItem("fo_bell_muted") === "1") { setMuted(true); mutedRef.current = true; } } catch { /* default on */ }
    const ding = () => {
      try {
        const ctx = new AudioContext();
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.04, ctx.currentTime); // QUIET
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
        gain.connect(ctx.destination);
        for (const [f, t] of [[880, 0], [1175, 0.12]] as const) {
          const o = ctx.createOscillator();
          o.type = "sine"; o.frequency.value = f;
          o.connect(gain); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.35);
        }
        setTimeout(() => ctx.close().catch(() => {}), 800);
      } catch { /* no audio permission — badge still updates */ }
    };
    const poll = async () => {
      try {
        const r = await fetch("/api/crm/unread", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { count: number };
        setCount(j.count);
        if (prevRef.current !== null && j.count > prevRef.current && !mutedRef.current) ding();
        prevRef.current = j.count;
        document.title = document.title.replace(/^\(\d+\) /, "");
        if (j.count > 0) document.title = `(${j.count}) ${document.title}`;
      } catch { /* next tick */ }
    };
    poll();
    const t = setInterval(poll, 45_000);
    return () => clearInterval(t);
  }, []);

  const toggle = () => {
    const next = !muted;
    setMuted(next); mutedRef.current = next;
    try { localStorage.setItem("fo_bell_muted", next ? "1" : "0"); } catch { /* fine */ }
  };

  return (
    <button onClick={toggle} title={muted ? "Text chime is OFF — click to turn on" : "Chimes softly when a seller texts — click to mute"}
      className="fixed right-16 top-3 z-50 grid h-10 w-10 place-items-center rounded-full bg-white text-base shadow-lg ring-1 ring-slate-200 hover:bg-slate-50">
      {muted ? "🔕" : "🔔"}
      {count > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-0.5 text-[9px] font-extrabold text-white">{count}</span>}
    </button>
  );
}
