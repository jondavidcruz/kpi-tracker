import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, canAccessCSuite } from "@/lib/auth";
import { getRevenueByUser, tierFor } from "@/lib/roster-revenue";
import { readCommissionPlans, planForUser } from "@/lib/commissions";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

// 📋 Performance review generator (Jon 2026-10-08). C-suite only, printable.
// Cadence recommendation: FULL review quarterly (aligned with Team 360) + a
// 10-minute numbers pulse monthly. Quarterly is often enough to see trend,
// frequent enough to correct course; twice-a-year lets problems run too long.
export default async function PerformanceReviewPage({ searchParams }: { searchParams: Promise<{ u?: string; days?: string }> }) {
  const me = await getCurrentUser();
  if (!canAccessCSuite(me)) return <Card className="p-10 text-center text-slate-400">🔒 C-suite only.</Card>;
  const sp = await searchParams;
  const days = Math.min(365, Math.max(30, Number(sp.days) || 90));
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const users = await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, position: true } });
  const u = users.find((x) => x.id === sp.u) ?? users[0];
  if (!u) return <Card className="p-10 text-center text-slate-400">No team members.</Card>;

  const [entries, alerts, rev, plans, profile] = await Promise.all([
    db.entry.findMany({ where: { userId: u.id, date: { gte: since } }, include: { kpi: { select: { name: true, emoji: true, unit: true, category: true } } } }),
    db.alert.findMany({ where: { userId: u.id, date: { gte: since } }, include: { kpi: { select: { name: true } } }, orderBy: { date: "desc" } }),
    getRevenueByUser(new Date().getFullYear()),
    readCommissionPlans(),
    db.teamProfile.findFirst({ where: { userId: u.id }, select: { startDate: true, lastPromotion: true } }),
  ]);

  // per-KPI rollup over the window
  const byKpi = new Map<string, { name: string; emoji: string; unit: string; category: string; total: number; daysLogged: number }>();
  for (const e of entries) {
    const k = byKpi.get(e.kpiId) ?? { name: e.kpi.name, emoji: e.kpi.emoji ?? "", unit: e.kpi.unit, category: e.kpi.category ?? "", total: 0, daysLogged: 0 };
    k.total += e.value; if (e.value > 0) k.daysLogged++;
    byKpi.set(e.kpiId, k);
  }
  const flagsByKpi = new Map<string, number>();
  for (const a of alerts) flagsByKpi.set(a.kpi.name, (flagsByKpi.get(a.kpi.name) ?? 0) + 1);
  const excused = alerts.filter((a) => a.excused).length;
  const unexplained = alerts.filter((a) => !a.repReason && !a.resolutionNote).length;
  const revRow = rev.byUserId.get(u.id);
  const tier = tierFor(revRow?.revenue ?? 0);
  const plan = planForUser(plans, u.name);
  const fmtV = (unit: string, n: number) => unit === "duration" ? `${Math.round(n / 3600)}h` : unit === "currency" ? `$${Math.round(n).toLocaleString()}` : Math.round(n).toLocaleString();
  const topFlagged = [...flagsByKpi.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="print:hidden">
        <SectionTitle title="📋 Performance Review" subtitle={`Last ${days} days · generated ${new Date().toLocaleDateString("en-US")} · print (Cmd+P) to save as PDF`} accent="bg-violet-500" />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {users.map((x) => (
            <Link key={x.id} href={`/team-roster/review?u=${x.id}&days=${days}`} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${x.id === u.id ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600"}`}>{x.name.split(" ")[0]}</Link>
          ))}
          <span className="ml-auto flex gap-1.5">
            {[90, 180].map((d) => <Link key={d} href={`/team-roster/review?u=${u.id}&days=${d}`} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${days === d ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600"}`}>{d}d</Link>)}
          </span>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xl font-extrabold text-slate-900">{u.name}</div>
            <div className="text-xs text-slate-500">{u.position || "—"} · joined {profile?.startDate || "—"}{profile?.lastPromotion ? ` · last promotion ${profile.lastPromotion}` : ""}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-extrabold text-violet-700">${(revRow?.revenue ?? 0).toLocaleString()}</div>
            <div className="text-[10px] font-semibold text-slate-400">closed-deal revenue credit · {tier.current.tier}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="KPI misses flagged" value={String(alerts.length)} sub={`${excused} excused · ${unexplained} never explained`} />
          <Stat label="Closed deals credited" value={String(revRow?.deals ?? 0)} sub={`$${(revRow?.revenueYtd ?? 0).toLocaleString()} this year`} />
          <Stat label="Commission goal" value={plan ? `$${plan.goalMonthly.toLocaleString()}/mo` : "—"} sub={plan ? "plan on file" : "no plan set"} />
        </div>

        <h3 className="mt-6 text-sm font-extrabold text-slate-800">📊 KPI production (last {days} days)</h3>
        <div className="mt-2 divide-y divide-slate-100">
          {[...byKpi.values()].sort((a, b) => (a.category === "green" ? -1 : 1)).map((k) => (
            <div key={k.name} className="flex items-center gap-3 py-1.5 text-sm">
              <span className={`w-2 shrink-0 self-stretch rounded ${k.category === "green" ? "bg-emerald-400" : "bg-sky-300"}`} />
              <span className="flex-1 text-slate-600">{k.emoji} {k.name}</span>
              <span className="text-xs text-slate-400">{k.daysLogged} active days</span>
              <span className="w-24 text-right font-extrabold tabular-nums text-slate-900">{fmtV(k.unit, k.total)}</span>
              {flagsByKpi.get(k.name) ? <span className="w-16 text-right text-xs font-bold text-amber-600">⚠️ {flagsByKpi.get(k.name)}×</span> : <span className="w-16 text-right text-xs text-emerald-500">✓</span>}
            </div>
          ))}
          {byKpi.size === 0 && <p className="py-3 text-xs text-slate-400">No KPI entries in this window.</p>}
        </div>

        <h3 className="mt-6 text-sm font-extrabold text-slate-800">🧭 Talking points for the sit-down</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {topFlagged.length > 0
            ? topFlagged.map(([name, n]) => <li key={name}><b>{name}</b> missed {n}× — ask what's blocking it and agree one concrete fix.</li>)
            : <li>No repeat KPI misses — recognize the consistency out loud.</li>}
          {unexplained > 0 && <li>{unexplained} flags had no reason filled in — reset the expectation: every miss gets one line of context same-day.</li>}
          {(revRow?.deals ?? 0) > 0
            ? <li>{revRow!.deals} closed deal{revRow!.deals > 1 ? "s" : ""} credited — walk through what worked and how to repeat it.</li>
            : <li>No closed-deal credit yet this window — connect their daily KPIs to the deal that will change that.</li>}
          {plan && <li>Commission check-in: are they pacing toward ${plan.goalMonthly.toLocaleString()}/mo? What would one more close mean for them personally?</li>}
          <li>End with their goals: next skill, next tier ({tier.next ? `$${tier.next.min.toLocaleString()} to ${tier.next.tier}` : "top of ladder"}), and what support they need from leadership.</li>
        </ul>

        <p className="mt-6 rounded-xl bg-violet-50 px-4 py-3 text-xs text-violet-800 ring-1 ring-violet-100 print:hidden">
          📅 <b>Recommended cadence:</b> full review like this one <b>quarterly</b> (same rhythm as Team 360 — do them together), plus a 10-minute numbers pulse monthly. Twice a year is too slow for a team this size: a bad quarter would run six months before it's addressed.
        </p>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-center ring-1 ring-slate-100">
      <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-xl font-extrabold text-slate-900">{value}</div>
      <div className="text-[10px] text-slate-400">{sub}</div>
    </div>
  );
}
