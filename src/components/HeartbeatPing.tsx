"use client";

import { useEffect, useState } from "react";
import { confirmDropOutage } from "@/app/actions";

/** Pings the server ~every minute. If we were clocked in and the connection
 *  dropped (power/internet), the ping comes back with a gap and we ask the rep
 *  to confirm what happened so it's logged + they're excused. */
export default function HeartbeatPing() {
  const [drop, setDrop] = useState<{ sinceMs: number; gapMin: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        const r = await fetch("/api/heartbeat", { method: "POST", cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (alive && j.drop) setDrop(j.drop);
      } catch { /* offline — we'll catch up on reconnect */ }
    };
    ping();
    // Ping every 30s so a real drop is caught fast (the server flags "dropped" after
    // 2 min with no heartbeat). Also ping the instant the tab is refocused or the
    // network returns, so a reconnect clears immediately instead of on the next tick.
    const id = setInterval(ping, 30000);
    const onVis = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", ping);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", ping); };
  }, []);

  if (!drop) return null;

  const confirm = async (kind: string) => {
    setBusy(true);
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("sinceMs", String(drop.sinceMs));
    try { await confirmDropOutage(fd); } catch { /* ignore */ }
    setDrop(null);
    setBusy(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3">
      <div className="w-full max-w-lg rounded-2xl border border-amber-300 bg-white p-4 shadow-xl">
        <div className="text-sm font-bold text-slate-800">⚠️ You dropped offline for ~{drop.gapMin} min</div>
        <div className="mb-3 text-xs text-slate-500">Was it a power or internet outage? We&apos;ll log it and excuse you for that time.</div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => confirm("power")} className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-200 disabled:opacity-50">⚡ Power outage</button>
          <button disabled={busy} onClick={() => confirm("internet")} className="rounded-lg bg-sky-100 px-3 py-1.5 text-sm font-semibold text-sky-800 hover:bg-sky-200 disabled:opacity-50">📶 Internet outage</button>
          <button disabled={busy} onClick={() => setDrop(null)} className="ml-auto rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-400 hover:text-slate-600 disabled:opacity-50">Not an outage</button>
        </div>
      </div>
    </div>
  );
}
