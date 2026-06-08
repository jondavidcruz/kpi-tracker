import Link from "next/link";
import {
  getActiveReps,
  getAllTargets,
  getDailyValues,
  getKpis,
  getMonthToDateSums,
  getSettings,
  resolveGoalWith,
} from "@/lib/data";
import { todayStr, friendlyDate, paceFraction, monthOf } from "@/lib/date";
import { formatValue, type Unit } from "@/lib/format";
import { statusClasses, statusVsGoal, statusVsPace, alertSeverity, type Status } from "@/lib/kpi";
import { dailyGap, monthlyGap, monthlyCatchup, buildCoaching } from "@/lib/gap";
import { POSITIONS } from "@/lib/roles";
import { db } from "@/lib/db";
import { Card, SectionTitle, Legend, ProgressBar } from "@/components/ui";
import type { Kpi, Target, User } from "@prisma/client";

export const dynamic = "force-dynamic";

interface GapItem {
  who: string;
  roleEmoji: string;
  kpiName: string;
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

  const [reps, perRepKpis, teamDaily, teamMonthly, dailyValues, mtdSums, targets, openAlerts] =
    await Promise.all([
      getActiveReps(),
      getKpis({ scope: "per_rep", computed: false }),
      getKpis({ scope: "team", cadence: "daily", computed: false }),
      getKpis({ scope: "team", cadence: "monthly", computed: false }),
      getDailyValues(date),
      getMonthToDateSums(date),
      getAllTargets(),
      db.alert.count({ where: { status: "open" } }),
    ]);

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

  return (
    <div className="space-y-7">
      {/* Hero */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Team Dashboard</h1>
            <p className="text-slate-500">{friendlyDate(date)}</p>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-5 border-r border-slate-200 pr-5">
              <Stat n={onGoal} label="on goal" tone="emerald" />
              <Stat n={gaps.length} label="behind" tone={gaps.length ? "red" : "slate"} />
            </div>
            {openAlerts > 0 ? (
              <Link
                href="/alerts"
                className="inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                {openAlerts} alert{openAlerts === 1 ? "" : "s"}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> All clear
              </span>
            )}
            <Link
              href="/entry"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700"
            >
              + Enter KPIs
            </Link>
          </div>
        </div>
      </Card>

      {/* Performance gaps */}
      <section>
        <SectionTitle
          title="Performance Gaps"
          subtitle="Who's behind today — and what it takes to close the gap"
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
                          {g.roleEmoji} {g.who} · {g.emoji} {g.kpiName}
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
          <SectionTitle title="Lead Sources — Today" accent="bg-sky-400" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {teamDaily.map((k) => {
              const value = dailyValues.get(`${k.id}|`) ?? null;
              return (
                <Card key={k.id} className="p-4">
                  <div className="text-xs font-medium text-slate-500">{k.emoji} {k.name}</div>
                  <div className="mt-1 text-3xl font-extrabold tabular-nums text-slate-800">
                    {value === null ? "—" : formatValue(k.unit as Unit, value)}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

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
        <SectionTitle title={`This Month — Pace (${month})`} accent="bg-emerald-400" />
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
                  <span className="text-xs font-medium text-slate-500">{k.emoji} {k.name}</span>
                  <span className={`text-xs font-semibold ${cls.text}`}>{cls.label}</span>
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

function Stat({ n, label, tone }: { n: number; label: string; tone: "emerald" | "red" | "slate" }) {
  const c = tone === "emerald" ? "text-emerald-600" : tone === "red" ? "text-red-600" : "text-slate-400";
  return (
    <div className="text-center">
      <div className={`text-2xl font-extrabold tabular-nums ${c}`}>{n}</div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
    </div>
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
                  {k.emoji} {k.name}
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
