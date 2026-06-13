import { bulkResolveAlerts } from "@/app/actions";
import { db } from "@/lib/db";
import { friendlyDate, todayStr, monthOf } from "@/lib/date";
import { formatValue, type Unit } from "@/lib/format";
import { buildCoaching } from "@/lib/gap";
import { findPipCandidates } from "@/lib/pip";
import { getSettings } from "@/lib/data";
import { reasonLabel } from "@/lib/alert-resolution";
import { Card, SectionTitle } from "@/components/ui";
import AlertInbox, { type AlertView } from "@/components/AlertInbox";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "open", label: "Open" },
  { key: "ack", label: "Acknowledged" },
  { key: "resolved", label: "Resolved" },
  { key: "trends", label: "📊 Trends" },
];

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "open";
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);

  const counts = Object.fromEntries(
    await Promise.all(
      ["open", "ack", "resolved"].map(async (k) => [k, await db.alert.count({ where: { status: k } })] as const),
    ),
  ) as Record<string, number>;

  return (
    <div className="space-y-5">
      <SectionTitle title="Alerts" subtitle="Off-target KPIs — resolve each with a reason and a fix" accent="bg-red-400" />

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <a
            key={t.key}
            href={`/alerts?status=${t.key}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              status === t.key ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
            }`}
          >
            {t.label}
            {t.key !== "trends" && <span className="tabular-nums"> ({counts[t.key] ?? 0})</span>}
          </a>
        ))}
      </div>

      {status === "trends" ? (
        <TrendsView today={today} />
      ) : (
        <>
          {(status === "open" || status === "ack") && (
            <Card className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <span className="font-semibold text-slate-500">Bulk:</span>
              <form action={bulkResolveAlerts} className="flex items-center gap-1.5">
                <input type="hidden" name="mode" value="date" />
                <input type="date" name="date" defaultValue={today} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
                <button className="rounded-md bg-slate-200 px-2.5 py-1 text-xs font-semibold hover:bg-slate-300">Resolve all for this date</button>
              </form>
              <form action={bulkResolveAlerts}>
                <input type="hidden" name="mode" value="older" />
                <input type="hidden" name="before" value={today} />
                <button className="rounded-md bg-slate-200 px-2.5 py-1 text-xs font-semibold hover:bg-slate-300">Clear everything before today</button>
              </form>
            </Card>
          )}
          <InboxForStatus status={status} today={today} />
        </>
      )}
    </div>
  );
}

async function InboxForStatus({ status, today }: { status: string; today: string }) {
  const alerts = await db.alert.findMany({
    where: { status },
    orderBy: [{ severity: "asc" }, { date: "desc" }, { createdAt: "desc" }],
    include: { kpi: true, user: true },
    take: 200,
  });

  // Context only needed for actionable tabs.
  const monthStart = `${monthOf(today)}-01`;
  const [monthGroups, pipCandidates] = await Promise.all([
    status === "open" || status === "ack"
      ? db.alert.groupBy({ by: ["kpiId", "userId"], where: { date: { gte: monthStart } }, _count: { _all: true } })
      : Promise.resolve([] as { kpiId: string; userId: string | null; _count: { _all: number } }[]),
    status === "open" ? findPipCandidates(today) : Promise.resolve([]),
  ]);
  const monthCountMap = new Map(monthGroups.map((g) => [`${g.kpiId}|${g.userId ?? ""}`, g._count._all]));
  const pipSet = new Set(pipCandidates.map((c) => `${c.userId}|${c.kpiKey}`));

  const views: AlertView[] = alerts.map((a) => {
    const unit = a.kpi.unit as Unit;
    const behind = Math.max(0, a.expected - a.actual);
    const coaching = buildCoaching({
      kpiKey: a.kpi.key,
      kpiName: a.kpi.name,
      unit,
      gap: { short: behind, goal: a.expected, value: a.actual },
      who: a.user?.name ?? null,
    });
    return {
      id: a.id,
      kpiKey: a.kpi.key,
      emoji: a.kpi.emoji,
      message: a.message,
      friendlyDate: friendlyDate(a.date),
      who: a.user ? a.user.name : "Team",
      severity: a.severity,
      behind: behind > 0 ? formatValue(unit, behind) : null,
      repReason: a.repReason,
      resolutionCategory: a.resolutionCategory,
      resolutionNote: a.resolutionNote,
      correctiveAction: a.correctiveAction,
      resolvedBy: a.resolvedBy,
      excused: a.excused,
      coachingPrefill: `Why: ${coaching.diagnose}\nFix:\n- ${coaching.plan.join("\n- ")}`,
      monthCount: monthCountMap.get(`${a.kpiId}|${a.userId ?? ""}`) ?? 1,
      pipEligible: a.userId ? pipSet.has(`${a.userId}|${a.kpi.key}`) : false,
    };
  });

  return <AlertInbox alerts={views} tab={status} />;
}

// --- Trends: turn resolved-with-a-reason data into coaching insight ----------
async function TrendsView({ today }: { today: string }) {
  const monthStart = `${monthOf(today)}-01`;
  const resolved = await db.alert.findMany({
    where: { status: "resolved", date: { gte: monthStart } },
    include: { kpi: true, user: true },
  });

  if (resolved.length === 0) {
    return <Card className="p-12 text-center text-slate-400">No resolved alerts yet this month. Resolve a few with reasons and patterns show up here.</Card>;
  }

  const byCategory = tally(resolved.map((a) => reasonLabel(a.resolutionCategory)));
  const byRep = new Map<string, { total: number; withReason: number }>();
  const byKpi = tally(resolved.map((a) => `${a.kpi.emoji} ${a.kpi.name}`));
  for (const a of resolved) {
    const who = a.user ? a.user.name : "Team";
    const cur = byRep.get(who) ?? { total: 0, withReason: 0 };
    cur.total += 1;
    if (a.resolutionNote || a.resolutionCategory) cur.withReason += 1;
    byRep.set(who, cur);
  }
  const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <p className="text-sm text-slate-500">This month, <strong>{resolved.length}</strong> alerts were resolved. The biggest single cause was{" "}
          <strong className="text-slate-800">{topCategory[0]}</strong> ({topCategory[1]}). If a cause is a supply problem (leads) or tech, that&apos;s a business fix, not a coaching one.</p>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold text-slate-700">Why KPIs were missed</h3>
          <BarList rows={[...byCategory.entries()].sort((a, b) => b[1] - a[1])} total={resolved.length} />
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold text-slate-700">Most-flagged KPIs</h3>
          <BarList rows={[...byKpi.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)} total={resolved.length} />
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">By person</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-400"><th className="pb-1">Person</th><th className="pb-1 text-right">Resolved</th><th className="pb-1 text-right">Documented</th></tr></thead>
          <tbody>
            {[...byRep.entries()].sort((a, b) => b[1].total - a[1].total).map(([who, s]) => (
              <tr key={who} className="border-t border-slate-100">
                <td className="py-1.5 font-medium text-slate-700">{who}</td>
                <td className="py-1.5 text-right tabular-nums">{s.total}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-500">{Math.round((s.withReason / s.total) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function tally(items: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return m;
}

function BarList({ rows, total }: { rows: [string, number][]; total: number }) {
  return (
    <div className="space-y-2">
      {rows.map(([label, n]) => (
        <div key={label}>
          <div className="flex items-center justify-between text-xs text-slate-600"><span>{label}</span><span className="tabular-nums">{n}</span></div>
          <div className="mt-0.5 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-navy" style={{ width: `${Math.round((n / total) * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
