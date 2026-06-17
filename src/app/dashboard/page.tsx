import Link from "next/link";
import {
  getActiveReps,
  getAllTargets,
  getDailyValues,
  getKpis,
  getMonthToDateSums,
  getOpenDeals,
  getSettings,
  resolveGoalWith,
} from "@/lib/data";
import { todayStr, friendlyDate, paceFraction, monthOf, datesInRange } from "@/lib/date";
import { formatValue, type Unit } from "@/lib/format";
import { statusClasses, statusVsGoal, statusVsPace, alertSeverity, type Status } from "@/lib/kpi";
import { dailyGap, monthlyGap, monthlyCatchup, buildCoaching } from "@/lib/gap";
import { dealsNeedingAttention } from "@/lib/deals";
import { findPipCandidates } from "@/lib/pip";
import { getDailyTrends } from "@/lib/trends";
import { getAwardBoard, getAiChampions } from "@/lib/awards";
import { POSITIONS } from "@/lib/roles";
import { KpiLabel } from "@/lib/kpiIcons";
import RecognitionBoards from "@/components/RecognitionBoards";
import { db } from "@/lib/db";
import { Card, SectionTitle, Legend, ProgressBar, MetricCard, Pill } from "@/components/ui";
import { CircleCheck, TrendingDown, Bell, Users, Banknote, ShieldAlert, Building2, type LucideIcon } from "lucide-react";
import type { Kpi, Target, User } from "@prisma/client";

export const dynamic = "force-dynamic";

interface GapItem {
  who: string;
  roleEmoji: string;
  kpiName: string;
  kpiKey: string;
  emoji: string;
  category: string;
  unit: Unit;
  value: number;
  goal: number;
  pct: number;
  catchup: string;
  diagnose: string;
  plan: string[];
  weight: number; // sort key: higher = more urgent
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const date = sp.date ?? todayStr(settings.orgTimezone);
  const month = monthOf(date);
  const fraction = paceFraction(date);

  const [reps, perRepKpis, teamDaily, teamMonthly, dailyValues, mtdSums, targets, openAlerts, openDeals, pipCandidates] =
    await Promise.all([
      getActiveReps(),
      getKpis({ scope: "per_rep", computed: false }),
      getKpis({ scope: "team", cadence: "daily", computed: false }),
      getKpis({ scope: "team", cadence: "monthly", computed: false }),
      getDailyValues(date),
      getMonthToDateSums(date),
      getAllTargets(),
      db.alert.count({ where: { status: "open" } }),
      getOpenDeals(),
      findPipCandidates(date),
    ]);
  const agingDeals = dealsNeedingAttention(openDeals, date);
  const trends = await getDailyTrends(date, 14);
  const [awardBoard, aiChampions] = await Promise.all([getAwardBoard(), getAiChampions()]);

  // --- Internet speed: today's recorded reading per rep + a 14-day history/trend ---
  const internetSpeedKpi = perRepKpis.find((k) => k.roleKey === "internet") ?? null;
  const [sy, sm, sd] = date.split("-").map(Number);
  const winStart = new Date(Date.UTC(sy, sm - 1, sd));
  winStart.setUTCDate(winStart.getUTCDate() - 13);
  const speedDays = datesInRange(winStart.toISOString().slice(0, 10), date); // 14 days incl. today
  const speedEntries = internetSpeedKpi
    ? await db.entry.findMany({
        where: { kpiId: internetSpeedKpi.id, date: { gte: speedDays[0], lte: date } },
        select: { userId: true, date: true, value: true },
      })
    : [];
  const speedMap = new Map<string, number>();
  for (const e of speedEntries) speedMap.set(`${e.userId}|${e.date}`, e.value);
  const speedReps = reps.filter((r) => r.tracksInternet);
  const onGoalSeries = trends.map((t) => t.onGoal);
  const behindSeries = trends.map((t) => t.behind);
  const loggedSeries = trends.map((t) => t.logged);
  const alertSeries = trends.map((t) => t.alertsRaised);
  const wkDelta = (s: number[]) => (s.length >= 6 ? s[s.length - 1] - s[s.length - 6] : 0);

  // --- Build the gap list (who's behind + how to close it) ---
  const gaps: GapItem[] = [];
  let onGoal = 0;
  const internetKpis = perRepKpis.filter((k) => k.roleKey === "internet");
  for (const pos of POSITIONS) {
    const roleReps = reps.filter((r) => r.position === pos.key);
    const roleKpis = perRepKpis.filter((k) => k.roleKey === pos.key);
    for (const rep of roleReps) {
      // each rep sees their role KPIs + internet KPI if they track it
      const repKpis = rep.tracksInternet ? [...roleKpis, ...internetKpis] : roleKpis;
      for (const k of repKpis) {
        const value = dailyValues.get(`${k.id}|${rep.id}`);
        if (value === undefined) continue;
        const goal = resolveGoalWith(targets, k, rep.id, month);
        if (goal === null || k.goalKind === "tracked") continue;
        const status = statusVsGoal(k.goalKind, value, goal);
        if (status === "hit") onGoal += 1;
        const g = dailyGap(k.goalKind, value, goal);
        if (g) {
          const coach = buildCoaching({ kpiKey: k.key, kpiName: k.name, unit: k.unit as Unit, gap: g, who: rep.name });
          gaps.push({
            who: rep.name,
            roleEmoji: pos.emoji,
            kpiName: k.name,
          kpiKey: k.key,
            emoji: k.emoji,
            category: k.category,
            unit: k.unit as Unit,
            value,
            goal,
            pct: goal ? (value / goal) * 100 : 0,
            catchup: coach.headline,
            diagnose: coach.diagnose,
            plan: coach.plan,
            weight: (k.category === "green" ? 1000 : 100) + (g.short / Math.max(1, goal)) * 100,
          });
        }
      }
    }
  }
  for (const k of teamMonthly) {
    const goal = resolveGoalWith(targets, k, null, month);
    if (goal === null || k.goalKind === "tracked") continue;
    const mtd = mtdSums.get(k.id) ?? 0;
    const g = monthlyGap(date, k.goalKind, mtd, goal);
    if (statusVsPace(k.goalKind, mtd, goal, fraction) === "hit") onGoal += 1;
    if (g) {
      const coach = buildCoaching({ kpiKey: k.key, kpiName: k.name, unit: k.unit as Unit, gap: g, who: null });
      gaps.push({
        who: "Team",
        roleEmoji: "🏢",
        kpiName: k.name,
        kpiKey: k.key,
        emoji: k.emoji,
        category: k.category,
        unit: k.unit as Unit,
        value: mtd,
        goal,
        pct: goal ? (mtd / goal) * 100 : 0,
        catchup: coach.headline,
        diagnose: coach.diagnose,
        plan: coach.plan,
        weight: (k.category === "green" ? 1000 : 100) + (g.behindPace / Math.max(1, goal)) * 100,
      });
    }
  }
  gaps.sort((a, b) => b.weight - a.weight);

  // Today's priorities: the few things actually worth acting on right now.
  const moneyGaps = gaps.filter((g) => g.category === "green").length;
  const repsLoggedToday = new Set([...dailyValues.keys()].map((k) => k.split("|")[1]).filter(Boolean)).size;
  const priorities: { Icon: LucideIcon; text: string; href: string; tone: string }[] = [];
  if (moneyGaps > 0) priorities.push({ Icon: Banknote, text: `${moneyGaps} money KPI${moneyGaps === 1 ? "" : "s"} behind today`, href: "/alerts", tone: "text-red-700 bg-red-50 ring-red-200" });
  if (pipCandidates.length > 0) priorities.push({ Icon: ShieldAlert, text: `${pipCandidates.length} rep-KPI${pipCandidates.length === 1 ? "" : "s"} PIP-eligible`, href: "/pip", tone: "text-orange-700 bg-orange-50 ring-orange-200" });
  if (agingDeals.length > 0) priorities.push({ Icon: Building2, text: `${agingDeals.length} deal${agingDeals.length === 1 ? "" : "s"} need attention`, href: "/report", tone: "text-violet-700 bg-violet-50 ring-violet-200" });

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Team dashboard</h1>
          <p className="text-sm text-slate-500">{friendlyDate(date)}</p>
        </div>
        <Link
          href="/entry"
          className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-navy-700"
        >
          + Enter KPIs
        </Link>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="On goal today" value={onGoal} icon={<CircleCheck size={18} />} spark={onGoalSeries} delta={wkDelta(onGoalSeries)} deltaTone={wkDelta(onGoalSeries) >= 0 ? "good" : "bad"} />
        <MetricCard label="Behind" value={gaps.length} icon={<TrendingDown size={18} />} spark={behindSeries} delta={wkDelta(behindSeries)} deltaTone={wkDelta(behindSeries) <= 0 ? "good" : "bad"} />
        <MetricCard label="Open alerts" value={openAlerts} icon={<Bell size={18} />} spark={alertSeries} hint={openAlerts ? "needs review" : "all clear"} hintTone={openAlerts ? "bad" : "good"} />
        <MetricCard label="Logged today" value={repsLoggedToday} icon={<Users size={18} />} spark={loggedSeries} delta={wkDelta(loggedSeries)} deltaTone={wkDelta(loggedSeries) >= 0 ? "good" : "neutral"} />
      </div>

      {/* Gamified recognition */}
      <RecognitionBoards champions={awardBoard.champions} aiChampions={aiChampions} variant="light" />

      {/* Today's priorities — the short list worth acting on now */}
      {priorities.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-sm font-semibold text-slate-700">Today&apos;s priorities</div>
          <div className="flex flex-wrap gap-2">
            {priorities.map((p, i) => {
              const Icon = p.Icon;
              return (
                <Link key={i} href={p.href} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ${p.tone}`}>
                  <Icon size={16} /> {p.text} <span aria-hidden>→</span>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {/* Performance gaps */}
      <section>
        <SectionTitle
          title="Performance Gaps"
          subtitle="Who's behind today, and what it takes to close the gap"
          accent="bg-red-400"
        />
        <Card className="p-2">
          {gaps.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              🎉 Everyone is on goal or pace right now. Nothing to chase.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {gaps.slice(0, 8).map((g, i) => {
                const isMoney = g.category === "green";
                return (
                  <li key={i} className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-4">
                      <span
                        className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          isMoney ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {isMoney ? "MONEY" : "ACTIVITY"}
                      </span>
                      <div className="min-w-[150px] flex-1">
                        <div className="font-semibold text-slate-800">
                          {g.who} · <KpiLabel kpiKey={g.kpiKey} name={g.kpiName} />
                        </div>
                        <div className="text-sm text-slate-500">{g.catchup}</div>
                      </div>
                      <div className="w-40">
                        <div className="mb-1 flex justify-between text-xs font-medium">
                          <span className="text-slate-700 tabular-nums">{formatValue(g.unit, g.value)}</span>
                          <span className="text-slate-400 tabular-nums">/ {formatValue(g.unit, g.goal)}</span>
                        </div>
                        <ProgressBar pct={g.pct} status={isMoney ? "miss" : "close"} />
                      </div>
                    </div>
                    {/* Gap assessment + training plan */}
                    <details className="mt-2 ml-1 group">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700">
                        🔍 Gap assessment & training plan
                      </summary>
                      <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
                        <p className="text-slate-600"><span className="font-semibold">Why:</span> {g.diagnose}</p>
                        <p className="mt-1.5 font-semibold text-slate-700">How to fix it:</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">
                          {g.plan.map((p, j) => <li key={j}>{p}</li>)}
                        </ul>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      {/* Lead sources */}
      {teamDaily.length > 0 && (
        <section>
          <SectionTitle title="Lead Sources: Today" accent="bg-sky-400" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {teamDaily.map((k) => {
              const value = dailyValues.get(`${k.id}|`) ?? null;
              return (
                <Card key={k.id} className="p-4">
                  <div className="text-xs font-medium text-slate-500"><KpiLabel kpiKey={k.key} name={k.name} /></div>
                  <div className="mt-1 text-3xl font-extrabold tabular-nums text-slate-800">
                    {value === null ? "—" : formatValue(k.unit as Unit, value)}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Internet speed — today's reading + 2-week history & trend per rep */}
      <InternetSpeedSection
        kpi={internetSpeedKpi}
        reps={speedReps}
        days={speedDays}
        valueAt={(uid, d) => speedMap.get(`${uid}|${d}`) ?? null}
        goalFor={(uid) => (internetSpeedKpi ? resolveGoalWith(targets, internetSpeedKpi, uid, month) : null)}
      />

      {/* Role scorecards */}
      {POSITIONS.map((pos) => {
        const roleReps = reps.filter((r) => r.position === pos.key);
        const roleKpis = perRepKpis.filter((k) => k.roleKey === pos.key);
        if (roleReps.length === 0 && roleKpis.length === 0) return null;
        return (
          <RoleScorecard
            key={pos.key}
            title={`${pos.emoji} ${pos.label}`}
            blurb={pos.blurb}
            reps={roleReps}
            kpis={roleKpis}
            dailyValues={dailyValues}
            targets={targets}
            month={month}
          />
        );
      })}

      {/* Monthly pace */}
      <section>
        <SectionTitle title={`This Month: Pace (${month})`} accent="bg-emerald-400" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {teamMonthly.map((k) => {
            const mtd = mtdSums.get(k.id) ?? 0;
            const goal = resolveGoalWith(targets, k, null, month);
            const status: Status = statusVsPace(k.goalKind, mtd, goal, fraction);
            const cls = statusClasses(status);
            const g = goal !== null ? monthlyGap(date, k.goalKind, mtd, goal) : null;
            const pct = goal ? (mtd / goal) * 100 : 0;
            return (
              <Card key={k.id} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500"><KpiLabel kpiKey={k.key} name={k.name} /></span>
                  <Pill tone={status === "hit" ? "good" : status === "close" ? "watch" : status === "miss" ? "bad" : "neutral"}>{cls.label}</Pill>
                </div>
                <div className={`mt-1 text-3xl font-extrabold tabular-nums ${cls.text}`}>
                  {formatValue(k.unit as Unit, mtd)}
                </div>
                <div className="mt-2">
                  <ProgressBar pct={pct} status={status} paceMarker={goal ? fraction * 100 : undefined} />
                  <div className="mt-1 text-xs text-slate-500">
                    {goal === null
                      ? "Tracked"
                      : g
                        ? monthlyCatchup(k.unit as Unit, g)
                        : `Goal ${formatValue(k.unit as Unit, goal)} · on pace`}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function InternetSpeedSection({
  kpi,
  reps,
  days,
  valueAt,
  goalFor,
}: {
  kpi: Kpi | null;
  reps: User[];
  days: string[];
  valueAt: (userId: string, date: string) => number | null;
  goalFor: (userId: string) => number | null;
}) {
  if (!kpi || reps.length === 0) return null;
  const tone = (v: number | null, goal: number) =>
    v === null ? "text-slate-300" : v >= goal ? "text-emerald-600" : v >= 25 ? "text-amber-600" : "text-red-600";
  return (
    <section>
      <SectionTitle
        title="📡 Internet Speed — daily"
        subtitle="Today's reading plus the last 2 weeks. Red bars = below goal — watch for reps with chronic slow days."
        accent="bg-indigo-400"
      />
      <Card className="divide-y divide-slate-100">
        {reps.map((rep) => {
          const goal = goalFor(rep.id) ?? 50;
          const series = days.map((d) => ({ date: d, v: valueAt(rep.id, d) }));
          const recorded = series.filter((s): s is { date: string; v: number } => s.v !== null);
          const today = series[series.length - 1].v;
          const avg = recorded.length ? Math.round(recorded.reduce((a, b) => a + b.v, 0) / recorded.length) : null;
          const min = recorded.length ? Math.min(...recorded.map((s) => s.v)) : null;
          const lowDays = recorded.filter((s) => s.v < goal).length;
          const scaleMax = Math.max(goal, ...recorded.map((s) => s.v), 1);
          return (
            <div key={rep.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="w-32 shrink-0">
                <div className="font-semibold text-slate-800">{rep.name}</div>
                <div className={`text-2xl font-extrabold tabular-nums ${tone(today, goal)}`}>
                  {today === null ? "—" : today}
                  <span className="text-xs font-semibold text-slate-400"> Mbps</span>
                </div>
              </div>
              <div className="flex flex-1 items-end gap-0.5" style={{ height: 48, minWidth: 160 }}>
                {series.map((s) => {
                  const h = s.v === null ? 3 : Math.max(3, Math.round((s.v / scaleMax) * 46));
                  const c = s.v === null ? "bg-slate-200" : s.v >= goal ? "bg-emerald-400" : s.v >= 25 ? "bg-amber-400" : "bg-red-400";
                  return (
                    <div
                      key={s.date}
                      title={`${s.date}: ${s.v === null ? "no test" : `${s.v} Mbps`}`}
                      className={`flex-1 rounded-sm ${c}`}
                      style={{ height: h }}
                    />
                  );
                })}
              </div>
              <div className="w-44 shrink-0 text-right text-xs text-slate-500">
                <div>avg <span className="font-semibold tabular-nums text-slate-700">{avg ?? "—"}</span> · low <span className="font-semibold tabular-nums text-slate-700">{min ?? "—"}</span> Mbps</div>
                <div>goal {goal}+ · <span className={lowDays >= 3 ? "font-semibold text-red-600" : "text-slate-400"}>{lowDays} day{lowDays === 1 ? "" : "s"} below</span></div>
                {recorded.length === 0 && <div className="text-amber-600">no tests logged yet</div>}
              </div>
            </div>
          );
        })}
      </Card>
      <p className="mt-1 text-xs text-slate-400">
        From the in-app speed test on <Link href="/entry" className="underline hover:text-slate-600">Enter KPIs</Link>. Bars are the last {days.length} days (oldest → today). Hover a bar for that day&apos;s reading.
      </p>
    </section>
  );
}

function RoleScorecard({
  title,
  blurb,
  reps,
  kpis,
  dailyValues,
  targets,
  month,
}: {
  title: string;
  blurb: string;
  reps: User[];
  kpis: Kpi[];
  dailyValues: Map<string, number>;
  targets: Target[];
  month: string;
}) {
  return (
    <section>
      <SectionTitle title={title} subtitle={blurb} accent="bg-slate-300" right={<Legend />} />
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70">
              <th className="sticky left-0 bg-slate-50/70 px-4 py-3 text-left font-semibold">Rep</th>
              {kpis.map((k) => (
                <th key={k.id} className="whitespace-nowrap px-3 py-3 text-center font-semibold">
                  <KpiLabel kpiKey={k.key} name={k.name} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reps.map((rep) => (
              <tr key={rep.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                <td className="sticky left-0 bg-white px-4 py-3 font-semibold text-slate-800">{rep.name}</td>
                {kpis.map((k) => {
                  const value = dailyValues.get(`${k.id}|${rep.id}`) ?? null;
                  const goal = resolveGoalWith(targets, k, rep.id, month);
                  const status: Status = value === null ? "none" : statusVsGoal(k.goalKind, value, goal);
                  const cls = statusClasses(status);
                  return (
                    <td key={k.id} className="px-3 py-2 text-center">
                      <span
                        className={`inline-flex min-w-16 flex-col items-center rounded-lg border px-2.5 py-1.5 font-bold tabular-nums ${cls.bg} ${cls.border} ${cls.text}`}
                      >
                        {value === null ? "—" : formatValue(k.unit as Unit, value)}
                        {goal !== null && (
                          <span className="text-[10px] font-medium text-slate-400">
                            /{formatValue(k.unit as Unit, goal)}
                          </span>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {reps.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={kpis.length + 1}>
                  No one assigned to this role yet. Add them in Admin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
