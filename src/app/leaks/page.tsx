import Link from "next/link";
import { getCurrentUser, canAccessCSuite } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { buildLeaks, buildLeaksNarrative } from "@/lib/diagnostics";
import { Card, SectionTitle } from "@/components/ui";
import LeaksExplain from "@/components/LeaksExplain";

export const dynamic = "force-dynamic";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const usd0 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function LeaksPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const me = await getCurrentUser();
  if (!me || !canAccessCSuite(me)) {
    return <Card className="mx-auto max-w-md p-8 text-center text-slate-500">🔒 War-room diagnostics are restricted to the C-suite (Jon, Viktoriia, Enrico).</Card>;
  }
  const sp = await searchParams;
  const range = (["week", "month", "ytd"].includes(sp.range ?? "") ? sp.range : "ytd") as "week" | "month" | "ytd";
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const d = await buildLeaks(today, range);

  const max = Math.max(...d.stages.map((s) => s.count), 1);
  const barColor = (key: string) => {
    if (key === "closed") return "bg-emerald-500";
    if (d.worstLeak && d.stages.find((s) => s.label === d.worstLeak!.to)?.key === key) return "bg-red-500";
    return "bg-brand-navy";
  };
  const econ = d.econ;
  const narrative = buildLeaksNarrative(d);
  const RANGES: { k: string; label: string }[] = [{ k: "week", label: "Last 7 days" }, { k: "month", label: "This month" }, { k: "ytd", label: "Year to date" }];

  return (
    <div className="space-y-5">
      <SectionTitle title="🩺 War Room Health — Leaks" subtitle="Live conversion funnel + unit economics from your real KPI, deal, and expense data." accent="bg-red-400"
        right={<span className="text-xs text-slate-400">C-suite only</span>} />

      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link key={r.k} href={`/leaks?range=${r.k}`} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${range === r.k ? "bg-brand-navy text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{r.label}</Link>
        ))}
      </div>

      {/* The biggest leak */}
      {d.worstLeak && d.worstLeak.lostPct >= 1 && (
        <Card className="border-l-4 border-red-500 bg-red-50/70 p-4">
          <div className="text-sm font-bold text-red-700">🚨 Biggest leak ({d.rangeLabel}): {d.worstLeak.from} → {d.worstLeak.to}</div>
          <div className="text-sm text-red-800">You&apos;re losing <b>{Math.round(d.worstLeak.lostPct)}%</b> of deals between these two steps. Fix this first.</div>
        </Card>
      )}

      {/* Funnel — color-coded bars */}
      <Card className="p-5">
        <div className="mb-3 text-sm font-bold text-slate-700">Conversion funnel · {d.rangeLabel}</div>
        <div className="space-y-2.5">
          {d.stages.map((s) => (
            <div key={s.key} className="flex items-center gap-3">
              <div className="w-32 shrink-0 text-right text-sm text-slate-600">{s.label}</div>
              <div className="flex flex-1 items-center gap-2">
                <div className={`flex h-8 min-w-12 items-center rounded-md px-2.5 text-sm font-bold text-white ${barColor(s.key)}`} style={{ width: `${Math.max(8, (s.count / max) * 100)}%` }}>{s.count.toLocaleString()}</div>
                <div className="text-xs text-slate-400">{s.convFromPrev != null ? `${Math.round(s.convFromPrev * 100)}% of prev` : "leads in"}</div>
              </div>
            </div>
          ))}
        </div>
        {d.leads === 0 && <p className="mt-3 text-xs text-slate-400">No KPIs logged for this range yet — the funnel fills in as the team logs leads, calls, offers, and contracts.</p>}
      </Card>

      {/* Lead accounting incl. refunds */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-bold text-slate-700">Lead accounting · {d.rangeLabel}</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Leads in</div><div className="text-xl font-extrabold tabular-nums text-slate-800">{d.leads.toLocaleString()}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Refunds requested</div><div className="text-xl font-extrabold tabular-nums text-amber-600">{d.refundRequested.toLocaleString()}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Refunds approved</div><div className="text-xl font-extrabold tabular-nums text-emerald-600">{d.refunded.toLocaleString()}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Net usable leads</div><div className="text-xl font-extrabold tabular-nums text-slate-800">{d.netLeads.toLocaleString()}</div></div>
        </div>
      </Card>

      {/* Unit economics */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-bold text-slate-700">Unit economics · {d.rangeLabel}</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { l: "Cost / lead", v: econ.costPerLead != null ? usd(econ.costPerLead) : "—" },
            { l: "Cost / signed", v: econ.costPerSigned != null ? usd0(econ.costPerSigned) : "—" },
            { l: "Cost / closed", v: econ.costPerClosed != null ? usd0(econ.costPerClosed) : "—" },
            { l: "Revenue / lead", v: econ.revenuePerLead != null ? usd(econ.revenuePerLead) : "—" },
            { l: "Revenue", v: usd0(econ.revenue) },
            { l: "Net", v: usd0(econ.net), tone: econ.net >= 0 ? "text-emerald-600" : "text-red-600" },
          ].map((c) => (
            <div key={c.l} className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">{c.l}</div>
              <div className={`text-lg font-extrabold tabular-nums ${c.tone ?? "text-slate-800"}`}>{c.v}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">The lever isn&apos;t lead cost (already cheap) — it&apos;s conversion. Raising lead→signed even a point or two multiplies contracts off the same spend.</p>
      </Card>

      {/* What this means — plain English, always shown */}
      <Card className="border-l-4 border-brand-gold p-5">
        <div className="mb-1 text-base font-bold text-slate-800">📋 What this means</div>
        <p className="text-sm font-semibold text-slate-700">{narrative.headline}</p>
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-100">🚨 {narrative.biggest}</div>
        {narrative.meaning.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
            {narrative.meaning.map((m, i) => <li key={i} className="flex gap-2"><span className="text-slate-300">•</span><span>{m}</span></li>)}
          </ul>
        )}
        {narrative.actions.length > 0 && (
          <div className="mt-3 rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-100">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-emerald-700">✅ What to do</div>
            <ul className="space-y-1 text-sm text-emerald-900">
              {narrative.actions.map((a, i) => <li key={i} className="flex gap-2"><span className="text-emerald-500">›</span><span>{a}</span></li>)}
            </ul>
          </div>
        )}
      </Card>

      {/* AI deep-dive — the full strategic breakdown on demand */}
      <LeaksExplain data={JSON.stringify({ rangeLabel: d.rangeLabel, stages: d.stages, worstLeak: d.worstLeak, econ: d.econ, leads: d.leads, refundRequested: d.refundRequested, refunded: d.refunded })} />
    </div>
  );
}
