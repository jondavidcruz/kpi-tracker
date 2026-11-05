// 🩺 Data & Performance health (Jon 2026-11-04 overnight) — the daily perf-watchdog
// (?perfsnap=1) has been quietly recording row-count growth, side-store sizes and live
// query timings into __perf_snapshots__ for weeks, but NOTHING surfaced it. This is the
// viewer: it answers "is our Supabase data growing in a way that will cost us / slow us
// down, and what's driving it" at a glance — the exact question behind the 2026-11-03
// egress lockout. Pure read-only; owner-only. Pairs with the live usage gauge on
// /comms-health (which needs the weekly manual Supabase/Vercel numbers entered).
import { getCurrentUser, isOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { readUsageLog, metricsFor, usageStatus, STALE_DAYS } from "@/lib/usage-watch";
import { Card, SectionTitle } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Snap = {
  at: string;
  rows: Record<string, number>;
  storeKb: number;
  bigStores: Record<string, number>;
  ms: { counts: number; board: number; vetting: number };
};

const ROW_LABELS: Record<string, string> = {
  opps: "Opportunities",
  contacts: "Contacts",
  events: "CRM events (notes/calls/texts)",
  tasks: "Tasks",
  appts: "Appointments",
  mkt: "Buyer network cards",
  touches: "Buyer touches",
};

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

/** The snapshot closest to `n` days ago (within a 3-day window), for growth deltas. */
function snapNearDaysAgo(hist: Snap[], n: number): Snap | null {
  let best: Snap | null = null;
  let bestDiff = Infinity;
  for (const s of hist) {
    const age = daysAgo(s.at);
    const diff = Math.abs(age - n);
    if (age >= n - 3 && diff < bestDiff) { best = s; bestDiff = diff; }
  }
  return best;
}

export default async function DataHealthPage() {
  const me = await getCurrentUser();
  if (!isOwner(me)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Owner only</h1>
        <p className="mt-2 text-sm text-slate-500">Data &amp; performance health is limited to the owner.</p>
      </div>
    );
  }

  // Perf snapshots (daily ?perfsnap cron) — newest first, 90-day window.
  const row = await db.resource.findFirst({ where: { category: "__perf_snapshots__" } }).catch(() => null);
  let hist: Snap[] = [];
  try { hist = row?.description ? (JSON.parse(row.description) as Snap[]) : []; } catch { hist = []; }
  const latest = hist[0] ?? null;
  const wk = snapNearDaysAgo(hist, 7);
  const mo = snapNearDaysAgo(hist, 30);

  // Live usage gauge (manual weekly numbers on /comms-health)
  const [usage, uStatus] = await Promise.all([readUsageLog(), usageStatus()]);
  const metrics = metricsFor(usage[0] ?? null);

  const fmtDelta = (now: number, then: number | undefined) => {
    if (then == null) return null;
    const d = now - then;
    const pct = then > 0 ? Math.round((d / then) * 100) : 0;
    return { d, pct, up: d > 0 };
  };

  const levelColor = (level: string) =>
    level === "act" ? "text-red-600" : level === "warn" ? "text-amber-600" : "text-emerald-600";
  const barColor = (level: string) =>
    level === "act" ? "bg-red-500" : level === "warn" ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-6">
      <SectionTitle
        title="🩺 Data & Performance health"
        subtitle="Is our Supabase data growing in a way that will cost us or slow us down — and what's driving it. Fed by the daily perf-watchdog. Read-only."
        accent="bg-brand-gold"
      />

      {/* ── Live platform usage (manual weekly numbers) ───────────────────── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Platform usage vs plan limits</h2>
          <Link href="/comms-health" className="text-[12px] font-semibold text-brand-navy hover:underline">Update numbers →</Link>
        </div>
        {metrics.length === 0 ? (
          <Card className="p-4 text-sm text-slate-500">
            No usage reading entered yet. Add this week&apos;s Supabase &amp; Vercel numbers on{" "}
            <Link href="/comms-health" className="font-semibold text-brand-navy hover:underline">Comms Health</Link> so this gauge goes live.
          </Card>
        ) : (
          <>
            {uStatus.stale && (
              <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700 ring-1 ring-amber-200">
                ⏰ This reading is more than {STALE_DAYS} days old — enter a fresh one on Comms Health.
              </div>
            )}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {metrics.map((m) => (
                <Card key={m.key} className="p-3.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] font-bold text-slate-600">{m.label}</span>
                    <span className={`text-sm font-extrabold ${levelColor(m.level)}`}>{m.pct}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${barColor(m.level)}`} style={{ width: `${Math.min(100, m.pct)}%` }} />
                  </div>
                  <div className="mt-1.5 text-[11px] text-slate-400">{m.used.toLocaleString()} / {m.limit.toLocaleString()} {m.unit}</div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Data growth (row counts) ─────────────────────────────────────── */}
      {!latest ? (
        <Card className="p-6 text-center text-sm text-slate-500">
          No perf snapshot recorded yet. The daily watchdog (<code className="rounded bg-slate-100 px-1">?perfsnap=1</code>) writes one each night — check back after the next run.
        </Card>
      ) : (
        <>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Data growth</h2>
              <span className="text-[11px] text-slate-400">last snapshot {daysAgo(latest.at) <= 0 ? "today" : `${daysAgo(latest.at)}d ago`} · {hist.length} in history</span>
            </div>
            <Card className="overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-2 text-left font-bold">Table</th>
                    <th className="px-4 py-2 text-right font-bold">Now</th>
                    <th className="px-4 py-2 text-right font-bold">vs 7d</th>
                    <th className="px-4 py-2 text-right font-bold">vs 30d</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(latest.rows)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => {
                      const dW = fmtDelta(v, wk?.rows[k]);
                      const dM = fmtDelta(v, mo?.rows[k]);
                      const cell = (d: ReturnType<typeof fmtDelta>) =>
                        !d || d.d === 0 ? <span className="text-slate-300">—</span>
                          : <span className={d.up ? "text-slate-600" : "text-emerald-600"}>{d.up ? "+" : ""}{d.d.toLocaleString()}{d.pct ? <span className="text-slate-400"> ({d.up ? "+" : ""}{d.pct}%)</span> : null}</span>;
                      return (
                        <tr key={k}>
                          <td className="px-4 py-2 font-semibold text-slate-700">{ROW_LABELS[k] ?? k}</td>
                          <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-800">{v.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right text-[13px] tabular-nums">{cell(dW)}</td>
                          <td className="px-4 py-2 text-right text-[13px] tabular-nums">{cell(dM)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </Card>
          </div>

          {/* ── Side-stores (Resource JSON blobs) ──────────────────────────── */}
          <div>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              Side-stores · {latest.storeKb.toLocaleString()} KB total
            </h2>
            {Object.keys(latest.bigStores).length === 0 ? (
              <Card className="p-4 text-sm text-emerald-600">✓ No side-store over 100 KB — JSON blobs are lean.</Card>
            ) : (
              <Card className="p-4">
                <p className="mb-3 text-[12px] text-slate-500">Resource-table JSON stores over 100 KB. A store over ~800 KB auto-files a 🛠 watchdog task to trim it.</p>
                <div className="space-y-1.5">
                  {Object.entries(latest.bigStores)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, kb]) => (
                      <div key={cat} className="flex items-center justify-between gap-3">
                        <code className="truncate text-[12px] text-slate-600">{cat}</code>
                        <span className={`shrink-0 text-sm font-bold tabular-nums ${kb > 800 ? "text-red-600" : kb > 400 ? "text-amber-600" : "text-slate-700"}`}>{kb.toLocaleString()} KB</span>
                      </div>
                    ))}
                </div>
              </Card>
            )}
          </div>

          {/* ── Live query timings ─────────────────────────────────────────── */}
          <div>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Query speed (last snapshot)</h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {[
                { label: "Count sweep", ms: latest.ms.counts },
                { label: "CRM board", ms: latest.ms.board },
                { label: "Buyer research", ms: latest.ms.vetting },
              ].map((t) => (
                <Card key={t.label} className="p-3.5">
                  <div className="text-[12px] font-bold text-slate-600">{t.label}</div>
                  <div className={`mt-1 text-2xl font-extrabold tabular-nums ${t.ms > 1500 ? "text-red-600" : t.ms > 800 ? "text-amber-600" : "text-emerald-600"}`}>
                    {t.ms.toLocaleString()}<span className="text-sm font-bold text-slate-400"> ms</span>
                  </div>
                </Card>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Over 1,500 ms auto-files a watchdog task. These are server-side DB timings, not full page loads.</p>
          </div>
        </>
      )}
    </div>
  );
}
