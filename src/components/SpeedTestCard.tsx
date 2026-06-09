"use client";

import { useState } from "react";
import { saveSpeedTest } from "@/app/actions";

// Prominent internet speed-test card for the Enter KPIs screen. Measures the
// connection in-browser, shows the result big, and saves it as today's KPI.
export default function SpeedTestCard({
  userId,
  date,
  goal,
  initial,
}: {
  userId: string;
  date: string;
  goal: number; // Mbps target
  initial: number | null; // already-logged value for today, if any
}) {
  const [mbps, setMbps] = useState<number | null>(initial);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  async function runTest() {
    setTesting(true);
    setErr("");
    setSaved(false);
    try {
      // Two passes; keep the faster (warms up the connection).
      const sizes = [3 * 1024 * 1024, 3 * 1024 * 1024];
      let best = 0;
      for (const bytes of sizes) {
        const start = performance.now();
        const res = await fetch(`/api/speedtest?t=${Date.now()}-${Math.round(start)}`, { cache: "no-store" });
        await res.arrayBuffer();
        const secs = (performance.now() - start) / 1000;
        const v = (bytes * 8) / secs / 1_000_000;
        if (v > best) best = v;
      }
      setMbps(Math.max(1, Math.round(best)));
    } catch {
      setErr("Test failed — check your connection and try again.");
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    if (mbps === null) return;
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("date", date);
    fd.set("mbps", String(mbps));
    await saveSpeedTest(fd);
    setSaved(true);
  }

  const status =
    mbps === null ? "none" : mbps >= goal ? "good" : mbps >= 25 ? "warn" : "bad";
  const tone =
    status === "good" ? "text-emerald-600" : status === "warn" ? "text-amber-600" : status === "bad" ? "text-red-600" : "text-slate-400";
  const ring =
    status === "good" ? "ring-emerald-200 bg-emerald-50" : status === "warn" ? "ring-amber-200 bg-amber-50" : status === "bad" ? "ring-red-200 bg-red-50" : "ring-slate-200 bg-white";

  return (
    <div className={`rounded-2xl p-5 ring-1 ${ring}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">⚡️ Internet Speed Test</h3>
          <p className="text-sm text-slate-500">
            Run a quick test, then save it. Goal: <strong>{goal}+ Mbps</strong> for smooth dialer / calls / CRM.
          </p>
        </div>
        <div className="text-right">
          <div className={`text-4xl font-extrabold tabular-nums ${tone}`}>
            {mbps === null ? "—" : `${mbps}`}
            <span className="text-base font-semibold text-slate-400"> Mbps</span>
          </div>
          {mbps !== null && (
            <div className={`text-xs font-semibold ${tone}`}>
              {status === "good" ? "✓ Good to work" : status === "warn" ? "⚠️ Below goal" : "🔴 Too slow"}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runTest}
          disabled={testing}
          className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-2 disabled:opacity-60"
        >
          {testing ? "Testing your connection…" : "▶︎ Run speed test"}
        </button>
        {mbps !== null && (
          <button
            type="button"
            onClick={save}
            disabled={saved}
            className="rounded-lg bg-brand-gold px-5 py-2.5 text-sm font-semibold text-brand-navy hover:opacity-90 disabled:opacity-60"
          >
            {saved ? "✓ Saved" : "Save result"}
          </button>
        )}
        {err && <span className="text-sm text-red-600">{err}</span>}
        {saved && <span className="text-sm text-emerald-700">Logged for today.</span>}
      </div>
    </div>
  );
}
