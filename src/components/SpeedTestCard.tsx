"use client";

import { useState } from "react";
import { saveSpeedTest } from "@/app/actions";
import { measureDownloadMbps } from "@/lib/speedtest-client";

type CheckRow = { time: string; mbps: number };

// Format "now" as a time in the org timezone (matches server-side fmtCheckTime),
// so a check appended client-side shows the same clock as the saved history.
function nowInTz(tz: string): string {
  try {
    return new Date().toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  } catch {
    return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
}

// Is it currently at/after 12:30 PM in the org timezone? (Post-lunch window —
// keep in sync with AFTERNOON_CHECK_MINUTES in lib/speed-checks.ts.)
function isAfternoonNow(tz: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return h * 60 + m >= 12 * 60 + 30;
  } catch {
    return false;
  }
}

// Prominent internet speed-test card for the Enter KPIs screen. Measures the
// connection in-browser, shows the result big, and saves it as today's KPI.
// Every run is also logged with its completion time (checks), and Mon–Thu a
// second post-lunch check (~1:00 PM) is expected after the 12–1 lunch break.
export default function SpeedTestCard({
  userId,
  date,
  goal,
  initial,
  checks,
  tz,
  pmRequired,
  pmDone,
}: {
  userId: string;
  date: string;
  goal: number; // Mbps target
  initial: number | null; // already-logged value for today, if any
  checks: CheckRow[]; // every check run today, oldest → newest, times in org tz
  tz: string; // org timezone (times shown in boss time, matching the manager view)
  pmRequired: boolean; // Mon–Thu: a post-lunch re-check is expected
  pmDone: boolean; // a check at/after 12:30 PM org time already exists
}) {
  const [mbps, setMbps] = useState<number | null>(initial);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [rough, setRough] = useState(false);
  const [log, setLog] = useState<CheckRow[]>(checks);
  const [afternoonDone, setAfternoonDone] = useState(pmDone);

  async function runTest() {
    setTesting(true);
    setErr("");
    setSaved(false);
    setRough(false);
    try {
      // Parallel-stream test against Cloudflare's nearest server (~8s),
      // ticking the display live as it measures.
      const result = await measureDownloadMbps((live) => setMbps(Math.round(live)));
      const final = Math.max(1, Math.round(result.mbps));
      setMbps(final);
      setRough(!result.accurate);
      // Auto-save today's result so it's always recorded (no extra click).
      await saveResult(final);
    } catch {
      setErr("Test failed. Check your connection and try again.");
    } finally {
      setTesting(false);
    }
  }

  async function saveResult(value: number) {
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("date", date);
    fd.set("mbps", String(value));
    await saveSpeedTest(fd);
    setSaved(true);
    setLog((l) => [...l, { time: nowInTz(tz), mbps: value }]);
    if (isAfternoonNow(tz)) setAfternoonDone(true);
  }

  async function save() {
    if (mbps !== null) await saveResult(mbps);
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
            Run a quick test — it saves to today&apos;s record automatically. Goal: <strong>{goal}+ Mbps</strong> for smooth dialer / calls / CRM.
            {pmRequired && <> Run it at <strong>shift start</strong> and again <strong>after lunch (~1:00 PM)</strong>.</>}
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
        {rough && <span className="text-sm text-amber-600">Rough estimate (test server unreachable, used backup method).</span>}
        {saved && <span className="text-sm text-emerald-700">Logged for today.</span>}
      </div>

      {(log.length > 0 || pmRequired) && (
        <div className="mt-4 border-t border-slate-200/70 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Today&apos;s checks</span>
            {log.map((c, i) => (
              <span key={i} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 tabular-nums">
                {c.time} · {c.mbps} Mbps
              </span>
            ))}
            {log.length === 0 && <span className="text-xs text-slate-400">none yet</span>}
            {pmRequired && (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                  afternoonDone ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"
                }`}
              >
                {afternoonDone ? "✓ Post-lunch check done" : "🍽 2nd check due after lunch"}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">Every test is kept with its time (shown in office time, PT) — reruns don&apos;t erase earlier checks.</p>
        </div>
      )}
    </div>
  );
}
