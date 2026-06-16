import Link from "next/link";
import { bulkResolveAlerts } from "@/app/actions";
import { db } from "@/lib/db";
import { friendlyDate, todayStr, monthOf } from "@/lib/date";
import { formatValue, type Unit } from "@/lib/format";
import { buildCoaching } from "@/lib/gap";
import { findPipCandidates } from "@/lib/pip";
import { getSettings, getActiveReps } from "@/lib/data";
import { getCurrentUser, isManager } from "@/lib/auth";
import { reasonLabel } from "@/lib/alert-resolution";
import { Card, SectionTitle } from "@/components/ui";
import AlertInbox, { type AlertView } from "@/components/AlertInbox";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "open", label: "Open" },
  { key: "accountability", label: "⚖️ Accountability" },
  { key: "ack", label: "Acknowledged" },
  { key: "resolved", label: "Resolved" },
  { key: "trends", label: "📊 Trends" },
];

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <p className="mt-2 text-sm text-slate-500">The alerts inbox is for managers. You can see your own flags on your Enter-KPIs screen and dashboard.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
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
      ) : status === "accountability" ? (
        <AccountabilityView today={today} />
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

// --- Accountability: per-rep EOD view — pattern -> verdict -> action ----------
// The point: a reason given 3+ times is a PATTERN, not a one-off. If it's
// company-side (leads/tech/process) it's a real blocker to FIX; if it's effort
// it's become an excuse and needs an accountability conversation / PIP.
const COMPANY_SIDE = new Set(["leads", "tech", "process"]);
const RECURRING_AT = 3; // same reason this many times in the window = a pattern

async function AccountabilityView({ today }: { today: string }) {
  const start = new Date(today + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - 13); // ~2 weeks
  const windowStart = start.toISOString().slice(0, 10);

  const [reps, alerts, pipCandidates] = await Promise.all([
    getActiveReps(),
    db.alert.findMany({
      where: { date: { gte: windowStart }, userId: { not: null } },
      include: { kpi: true, user: true },
      orderBy: { date: "desc" },
      take: 1000,
    }),
    findPipCandidates(today),
  ]);
  const pipByUser = new Map<string, { kpiName: string }[]>();
  for (const c of pipCandidates) {
    const arr = pipByUser.get(c.userId) ?? [];
    arr.push({ kpiName: c.kpiName });
    pipByUser.set(c.userId, arr);
  }

  type Tone = "red" | "amber" | "slate" | "emerald";
  const rows = reps.map((r) => {
    const mine = alerts.filter((a) => a.userId === r.id);
    const nonExcused = mine.filter((a) => !a.excused);
    const days = new Set(nonExcused.map((a) => a.date)).size;
    const undocumented = nonExcused.filter((a) => a.status !== "resolved" && !a.repReason);
    const excused = mine.length - nonExcused.length;

    const reasonTally = new Map<string, number>();
    for (const a of mine) {
      if (a.excused) continue;
      const c = a.resolutionCategory;
      if (c && c !== "recovered") reasonTally.set(c, (reasonTally.get(c) ?? 0) + 1);
    }
    const sortedReasons = [...reasonTally.entries()].sort((a, b) => b[1] - a[1]);
    const top = sortedReasons[0];
    const pipEligible = pipByUser.has(r.id);

    let tone: Tone = "emerald";
    let head = "No pattern — one-offs";
    let body = "Isolated or excused misses. No action needed.";
    let cta: { href: string; label: string } | null = null;

    if (pipEligible) {
      tone = "red";
      head = "PIP-eligible now";
      body = `4+ consecutive misses on ${pipByUser.get(r.id)!.map((p) => p.kpiName).join(", ")}. The runway for justifications is over — open a plan.`;
      cta = { href: "/pip", label: "Open a PIP →" };
    } else if (top && top[1] >= RECURRING_AT && top[0] === "effort") {
      tone = "red";
      head = "Recurring effort gap → accountability";
      body = `"Effort / focus" came up ${top[1]}× in 2 weeks. A reason this often is no longer a justification — it's an excuse. Have the accountability conversation today; open a PIP if it continues.`;
      cta = { href: "/pip", label: "Review for PIP →" };
    } else if (top && top[1] >= RECURRING_AT && COMPANY_SIDE.has(top[0])) {
      tone = "amber";
      head = "Recurring blocker → fix it (not coaching)";
      body = `${reasonLabel(top[0])} came up ${top[1]}× in 2 weeks. This is a real justification — the fix is on us (e.g. more leads, fix the tech), not a coaching conversation. Raise it as an issue and solve the blocker.`;
      cta = { href: "/issues", label: "Raise an issue →" };
    } else if (top && top[1] >= RECURRING_AT && top[0] === "training") {
      tone = "amber";
      head = "Recurring skill gap → coach";
      body = `Training came up ${top[1]}× in 2 weeks. Targeted coaching on this skill; escalate to a PIP if it persists.`;
    } else if (undocumented.length >= RECURRING_AT) {
      tone = "slate";
      head = `${undocumented.length} misses with no reason`;
      body = "Get the why at end of day and resolve each with a category — you can't tell a justification from an excuse until the pattern is documented.";
      cta = { href: "/alerts?status=open", label: "Resolve open misses →" };
    } else if (nonExcused.length === 0) {
      head = "Clean — no misses";
      body = excused > 0 ? `${excused} excused (PTO/outage) — fine.` : "No flagged misses in the last 2 weeks.";
    }

    return { rep: r.name, total: nonExcused.length, days, excused, reasons: sortedReasons, undocumented: undocumented.length, tone, head, body, cta };
  });

  const order: Record<Tone, number> = { red: 0, amber: 1, slate: 2, emerald: 3 };
  const sorted = rows.sort((a, b) => order[a.tone] - order[b.tone] || b.total - a.total);

  const toneCls: Record<Tone, string> = {
    red: "border-red-300 bg-red-50",
    amber: "border-amber-300 bg-amber-50",
    slate: "border-slate-300 bg-slate-50",
    emerald: "border-emerald-300 bg-emerald-50",
  };
  const headCls: Record<Tone, string> = {
    red: "text-red-800", amber: "text-amber-800", slate: "text-slate-700", emerald: "text-emerald-800",
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="mb-1 text-sm font-bold text-slate-700">⚖️ End-of-day accountability</h3>
        <p className="text-xs text-slate-500">
          How to read this: a reason given <strong>{RECURRING_AT}+ times in two weeks is a pattern</strong>, not a one-off.
          Company-side reasons (low leads, tech) are real <strong>justifications</strong> — fix the blocker.
          &ldquo;Effort/focus&rdquo; repeated is an <strong>excuse</strong> — hold the line with a conversation, then a PIP.
          Document every miss with a reason so the pattern is visible.
        </p>
      </Card>

      {sorted.every((r) => r.tone === "emerald") && (
        <Card className="p-8 text-center text-sm text-slate-400">Everyone&apos;s clean over the last two weeks. 🎉</Card>
      )}

      {sorted.filter((r) => r.tone !== "emerald" || r.total > 0).map((r) => (
        <Card key={r.rep} className={`border-l-4 p-4 ${toneCls[r.tone]}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-slate-800">{r.rep}</span>
            <span className="text-xs text-slate-500">{r.total} miss{r.total === 1 ? "" : "es"} · {r.days} day{r.days === 1 ? "" : "s"} flagged{r.excused ? ` · ${r.excused} excused` : ""}</span>
            {r.undocumented > 0 && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{r.undocumented} undocumented</span>}
          </div>

          {r.reasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.reasons.map(([cat, n]) => (
                <span key={cat} className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${n >= RECURRING_AT ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
                  {reasonLabel(cat)} ×{n}
                </span>
              ))}
            </div>
          )}

          <div className="mt-2">
            <div className={`text-sm font-bold ${headCls[r.tone]}`}>{r.head}</div>
            <p className="mt-0.5 text-sm text-slate-600">{r.body}</p>
            {r.cta && <Link href={r.cta.href} className="mt-1.5 inline-block text-sm font-semibold text-brand-navy hover:underline">{r.cta.label}</Link>}
          </div>
        </Card>
      ))}
    </div>
  );
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
