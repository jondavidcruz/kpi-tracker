import Link from "next/link";
import { getCurrentUser, isManager, isOwner } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { checkAndRecordComms } from "@/lib/comms-health";
import { recordPlatformUsageAction } from "@/app/actions";
import { readUsageLog, metricsFor, usageStatus, WARN_PCT, ACT_PCT, CLAUDE_DOWNGRADE_PCT } from "@/lib/usage-watch";

export const dynamic = "force-dynamic";

// 🛡️ Comms Guardian board — one screen that proves calling, texting, and email are
// all working, inbound and outbound. Runs the live battery on load (throttled to once
// a minute), the same one the /api/comms-health endpoint + scheduled guardian use.
export default async function CommsHealthPage({ searchParams }: { searchParams: Promise<{ usagesaved?: string }> }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!me) return null;
  const owner = isOwner(me);
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <p className="mt-1 text-sm text-slate-500">The Comms Guardian board is for leadership.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const snap = await checkAndRecordComms();
  // 📊 Platform Usage Watch data (owner-only) — the guardrail against another quota shutdown.
  const usageLog = owner ? await readUsageLog() : [];
  const usageLatest = usageLog[0] ?? null;
  const usageMetrics = metricsFor(usageLatest);
  const usage = owner ? await usageStatus() : null;
  const channels: { channel: "voice" | "sms" | "email"; title: string; emoji: string }[] = [
    { channel: "voice", title: "Calling", emoji: "📞" },
    { channel: "sms", title: "Texting", emoji: "💬" },
    { channel: "email", title: "Email", emoji: "✉️" },
  ];
  const downCount = snap.lanes.filter((l) => !l.ok).length;
  const recent = (snap.history ?? []).slice(0, 24);

  return (
    <div className="space-y-5">
      <SectionTitle title="🛡️ Comms Guardian" subtitle="Calling, texting, and email — inbound and outbound — tested live and kept working 24/7. Managers get an email the moment any line goes down." accent={downCount ? "bg-red-500" : "bg-emerald-500"} />

      <Card className={`flex flex-wrap items-center gap-4 p-5 ${downCount ? "ring-2 ring-red-200" : "ring-1 ring-emerald-100"}`}>
        <div className={`grid h-16 w-16 shrink-0 place-items-center rounded-full text-3xl ${downCount ? "bg-red-50" : "bg-emerald-50"}`}>{downCount ? "🔴" : "🟢"}</div>
        <div className="min-w-[220px] flex-1">
          <div className="text-lg font-extrabold text-slate-900">{downCount ? `${downCount} line${downCount === 1 ? "" : "s"} down` : "All systems go"}</div>
          <div className="text-xs text-slate-500">Last checked {new Date(snap.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · re-runs live on load (max once/min)</div>
        </div>
        <div className="text-right text-[11px] text-slate-400">
          <div>Uptime monitor: point it at</div>
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">/api/comms-health</code>
          <div className="mt-0.5">200 = healthy · 503 = down</div>
        </div>
      </Card>

      {owner && (() => {
        const barColor = (lvl: string) => lvl === "act" ? "bg-red-500" : lvl === "warn" ? "bg-amber-500" : "bg-emerald-500";
        const ring = usage?.level === "act" ? "ring-2 ring-red-300" : usage?.level === "warn" ? "ring-2 ring-amber-300" : "ring-1 ring-indigo-100";
        const cc = usageLatest?.claudeCodePeakPct;
        return (
        <Card id="usage" className={`border-l-4 border-indigo-500 p-5 ${ring}`}>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-extrabold text-slate-900">📊 Platform Usage Watch</span>
            <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">OWNER ONLY</span>
            {usage?.recordedAt && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${usage.level === "act" ? "bg-red-100 text-red-700" : usage.level === "warn" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{usage.level === "act" ? "🔴 Near a limit" : usage.level === "warn" ? "🟠 Watch" : "🟢 Healthy"}</span>}
            {usage?.stale && usage.recordedAt && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">⏳ reading is stale</span>}
            {sp.usagesaved && <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">✓ reading saved</span>}
          </div>
          <p className="mb-3 text-[11px] text-slate-500">So we never get a quota shutdown again (like 2026-11-03). Record the week&apos;s real numbers from the two dashboards below — this flags anything nearing a limit. The Friday routine checks it automatically.</p>

          {usageMetrics.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {usageMetrics.map((m) => (
                <div key={m.key} className="rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-100">
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span className="font-semibold text-slate-700">{m.label}</span>
                    <span className={`font-bold ${m.level === "act" ? "text-red-600" : m.level === "warn" ? "text-amber-600" : "text-slate-500"}`}>{m.used} / {m.limit} {m.unit} · {m.pct}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${barColor(m.level)}`} style={{ width: `${Math.min(100, m.pct)}%` }} /></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-amber-50 p-3 text-[12px] font-semibold text-amber-800 ring-1 ring-amber-200">No reading yet — record this week&apos;s numbers below so the guardrail starts tracking.</div>
          )}

          {/* 🤖 Claude Code: flat subscription — this answers the $200 → $100 downgrade question */}
          <div className="mt-3 rounded-lg bg-violet-50 p-3 ring-1 ring-violet-200">
            <div className="text-[12px] font-bold text-violet-900">🤖 Claude Code plan {usageLatest?.claudeCodePlan ? `— ${usageLatest.claudeCodePlan}` : ""}</div>
            {cc != null ? (
              <div className="mt-0.5 text-[12px] text-slate-700">Peak usage this period: <b>{cc}%</b> of the plan&apos;s limit. {cc <= CLAUDE_DOWNGRADE_PCT
                ? <span className="font-semibold text-emerald-700">🟢 The $100 (Max 5x) plan would likely cover you — peak is under ~{CLAUDE_DOWNGRADE_PCT}%.</span>
                : <span className="font-semibold text-red-700">🔴 Stay on $200 for now — peak {cc}% is above the ~{CLAUDE_DOWNGRADE_PCT}% the $100 plan could absorb.</span>}</div>
            ) : (
              <div className="mt-0.5 text-[12px] text-slate-600">It&apos;s a flat fee, not metered — so the question is whether your usage fits the cheaper plan. Run <code className="rounded bg-white px-1 py-0.5 text-[11px]">/usage</code> in Claude Code, read your peak %, and record it below. Under ~{CLAUDE_DOWNGRADE_PCT}% most weeks ⇒ the $100 plan likely covers it.</div>
            )}
          </div>

          {/* ✍️ Record this week's reading */}
          <details className="mt-3 rounded-lg bg-white ring-1 ring-slate-200">
            <summary className="cursor-pointer px-3 py-2 text-[12px] font-bold text-indigo-700">✍️ Record this week&apos;s reading</summary>
            <form action={recordPlatformUsageAction} className="grid gap-2 p-3 pt-0 sm:grid-cols-3">
              {([
                ["egressGB", "Supabase egress (GB)"], ["storageGB", "Supabase file storage (GB)"], ["dbSizeGB", "Supabase DB size (GB)"],
                ["logGB", "Supabase log ingestion (GB)"], ["vercelBandwidthGB", "Vercel bandwidth (GB)"], ["claudeCodePeakPct", "Claude Code peak % this period"],
              ] as [string, string][]).map(([k, label]) => (
                <label key={k} className="flex flex-col text-[11px]"><span className="mb-0.5 font-semibold text-slate-500">{label}</span><input name={k} inputMode="decimal" placeholder="0" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></label>
              ))}
              <label className="flex flex-col text-[11px]"><span className="mb-0.5 font-semibold text-slate-500">Claude Code plan</span>
                <select name="claudeCodePlan" defaultValue={usageLatest?.claudeCodePlan ?? "$200 Max 20x"} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                  <option>$200 Max 20x</option><option>$100 Max 5x</option><option>$20 Pro</option>
                </select></label>
              <label className="flex flex-col text-[11px] sm:col-span-2"><span className="mb-0.5 font-semibold text-slate-500">Billing cycle ends (optional)</span><input name="cycleEnd" placeholder="03 Dec 2026" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></label>
              <label className="flex flex-col text-[11px] sm:col-span-3"><span className="mb-0.5 font-semibold text-slate-500">Note (optional)</span><input name="note" placeholder="anything unusual this week" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></label>
              <button className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 sm:col-span-3">Save reading</button>
            </form>
          </details>

          {/* 🔗 Where to read the numbers */}
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <a href="https://supabase.com/dashboard/project/_/reports" target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100">Supabase usage ↗</a>
            <a href="https://vercel.com/dashboard/usage" target="_blank" rel="noopener noreferrer" className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200">Vercel usage ↗</a>
            <span className="rounded-lg bg-violet-50 px-2.5 py-1 font-bold text-violet-700 ring-1 ring-violet-200">Claude Code: run <code className="bg-white px-1">/usage</code></span>
            <span className="ml-auto self-center text-slate-400">Warn at {WARN_PCT}% · act at {ACT_PCT}%</span>
          </div>

          {/* 📈 Trend */}
          {usageLog.length > 1 && (
            <div className="mt-3 border-t border-slate-100 pt-2">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Recent readings</div>
              <div className="space-y-0.5">
                {usageLog.slice(0, 8).map((r, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                    <span className="w-24 font-semibold text-slate-500">{new Date(r.at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                    <span>egress <b>{r.egressGB}</b></span>
                    <span>storage <b>{r.storageGB}</b></span>
                    {r.logGB != null && <span>log <b>{r.logGB}</b></span>}
                    {r.vercelBandwidthGB != null && <span>vercel <b>{r.vercelBandwidthGB}</b></span>}
                    {r.claudeCodePeakPct != null && <span>CC <b>{r.claudeCodePeakPct}%</b></span>}
                    {r.note && <span className="text-slate-400">· {r.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
        );
      })()}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {channels.map((c) => {
          const lanes = snap.lanes.filter((l) => l.channel === c.channel);
          const chDown = lanes.some((l) => !l.ok);
          return (
            <Card key={c.channel} className={`p-4 ${chDown ? "ring-1 ring-red-200" : ""}`}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xl">{c.emoji}</span>
                <span className="text-sm font-extrabold text-slate-800">{c.title}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${chDown ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{chDown ? "needs attention" : "healthy"}</span>
              </div>
              <div className="space-y-2">
                {lanes.map((l) => (
                  <div key={l.key} className={`rounded-lg p-2.5 ring-1 ${l.ok ? "bg-emerald-50/50 ring-emerald-100" : "bg-red-50 ring-red-200"}`}>
                    <div className="flex items-center gap-2">
                      <span>{l.ok ? "🟢" : "🔴"}</span>
                      <span className="text-[12px] font-bold text-slate-800">{l.direction === "outbound" ? "➡️ Outbound" : "⬅️ Inbound"}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-600">{l.detail}</div>
                    {!l.ok && l.fix && <div className="mt-1 rounded bg-white px-2 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-red-100">🔧 {l.fix}</div>}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Recent checks</div>
        <div className="flex flex-wrap gap-1">
          {recent.length === 0 ? <span className="text-[12px] text-slate-400">No history yet — checks accumulate as the guardian runs.</span> : recent.map((h, i) => (
            <span key={i} title={`${new Date(h.at).toLocaleString()}${h.down.length ? ` — down: ${h.down.join(", ")}` : " — all healthy"}`}
              className={`h-4 w-4 rounded-sm ${h.ok ? "bg-emerald-400" : "bg-red-400"}`} />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Each square is one check (newest first). Green = everything up, red = a line was down. Hover for details.</p>
      </Card>

      <Card className="border-l-4 border-slate-300 p-4 text-[12px] text-slate-600">
        <b className="text-slate-800">How this stays on 24/7:</b> the board self-tests whenever anyone opens their phone or this page, a nightly job runs the full battery, and a scheduled Comms Guardian checks it around the clock and emails Jon on any outage. For minute-by-minute coverage even when nobody&apos;s logged in, point a free uptime monitor (UptimeRobot) at <code className="rounded bg-slate-100 px-1 py-0.5">/api/comms-health</code> — it returns 503 the instant a line drops.
      </Card>
    </div>
  );
}
