import { saveDay } from "@/app/actions";
import EntryForm, { type EntryGroup } from "@/components/EntryForm";
import { db } from "@/lib/db";
import { getKpis, getMonthlyValues, getSettings, getActiveReps, getRangeSums, getAllTargets, resolveGoalWith } from "@/lib/data";
import { todayStr, monthBounds, monthOf, daysInMonth, dayOfMonth } from "@/lib/date";
import { formatValue, toInputNumber, type Unit } from "@/lib/format";
import { POSITIONS } from "@/lib/roles";
import { KpiLabel } from "@/lib/kpiIcons";
import RepRoleBars from "@/components/RepRoleBars";
import HubTabs from "@/components/HubTabs";
import { getCurrentUser, isManager } from "@/lib/auth";
import {
  computeDerived,
  statusClasses,
  statusVsPace,
  type MonthlyInputs,
} from "@/lib/kpi";

export const dynamic = "force-dynamic";

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : monthOf(today);
  const monthStart = `${month}-01`;
  // Working days (Mon–Fri) in the month → per-rep monthly target for the KPI bars.
  const [mY, mM] = month.split("-").map(Number);
  let workdaysInMonth = 0;
  for (let dd = 1; dd <= new Date(Date.UTC(mY, mM, 0)).getUTCDate(); dd++) { const dow = new Date(Date.UTC(mY, mM - 1, dd)).getUTCDay(); if (dow >= 1 && dow <= 5) workdaysInMonth++; }
  const { end: monthEnd } = monthBounds(monthStart);
  const isCurrentMonth = month === monthOf(today);
  const fraction = isCurrentMonth ? dayOfMonth(today) / daysInMonth(today) : 1;

  const [enteredKpis, computedKpis, monthlyValues, reps, perRepKpis, monthSums, targets] = await Promise.all([
    getKpis({ scope: "team", cadence: "monthly", computed: false }),
    getKpis({ scope: "team", cadence: "monthly", computed: true }),
    getMonthlyValues(monthStart),
    getActiveReps(),
    getKpis({ scope: "per_rep", cadence: "daily", computed: false }),
    getRangeSums(monthStart, monthEnd),
    getAllTargets(),
  ]);

  // Total leads for the month = daily "Leads Generated" + "PPL Leads" entries.
  const leadKpis = await db.kpi.findMany({
    where: { key: { in: ["leads_generated", "ppl_leads"] } },
  });
  const leadEntries = leadKpis.length
    ? await db.entry.findMany({
        where: {
          kpiId: { in: leadKpis.map((k) => k.id) },
          date: { gte: monthStart, lte: monthEnd },
        },
      })
    : [];
  const totalLeads = leadEntries.reduce((s, e) => s + e.value, 0);

  // Company-money sections (goal pace, ratios, monthly inputs) are managers-only;
  // the per-rep activity scoreboard stays visible to the whole team.
  const me = await getCurrentUser();
  const manager = isManager(me);

  const byKey = new Map(enteredKpis.map((k) => [k.key, k]));
  const valOf = (key: string) => {
    const k = byKey.get(key);
    return k ? monthlyValues.get(k.id) ?? 0 : 0;
  };
  const inputs: MonthlyInputs = {
    totalLeads,
    dealsClosed: valOf("deals_closed"),
    grossRevenue: valOf("gross_revenue"),
    marketingSpend: valOf("marketing_spend"),
    operatingExpenses: valOf("operating_expenses"),
  };

  const entryGroup: EntryGroup = {
    title: "Monthly numbers",
    hint: "Entered once per month for the whole team.",
    items: enteredKpis.map((k) => ({
      kpiId: k.id,
      kpiKey: k.key,
      name: k.name,
      emoji: k.emoji,
      unit: k.unit as Unit,
      goalValue: k.goalValue,
      goalKind: k.goalKind,
      userId: "",
      initial: toInputNumber(k.unit as Unit, monthlyValues.get(k.id)),
    })),
  };

  return (
    <div className="space-y-8">
      <HubTabs tabs={[{ href: "/report", label: "Weekly report" }, { href: "/monthly", label: "Monthly report" }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Monthly</h1>
          <p className="text-slate-500">{month}{isCurrentMonth ? " · in progress" : ""}</p>
        </div>
        <form action="/monthly" method="get" className="flex items-center gap-2 text-sm">
          <label className="text-slate-500">Month</label>
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="rounded-md border border-slate-300 px-3 py-1.5"
          />
          <button className="rounded-md bg-slate-200 px-3 py-1.5 font-medium hover:bg-slate-300">
            Go
          </button>
        </form>
      </div>

      {/* Pace summary for goal-bearing monthly KPIs (managers only) */}
      {manager && (
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Goal pace
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {enteredKpis
            .filter((k) => k.goalValue !== null)
            .map((k) => {
              const actual = monthlyValues.get(k.id) ?? 0;
              const status = statusVsPace(k.goalKind, actual, k.goalValue, fraction);
              const cls = statusClasses(status);
              const pct = k.goalValue ? Math.min(100, (actual / k.goalValue) * 100) : 0;
              const pacePct = Math.min(100, fraction * 100);
              return (
                <div key={k.id} className={`rounded-xl border p-4 ${cls.bg} ${cls.border}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600"><KpiLabel kpiKey={k.key} name={k.name} /></span>
                    <span className={`text-sm font-semibold ${cls.text}`}>{cls.label}</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className={`text-2xl font-bold ${cls.text}`}>
                      {formatValue(k.unit as Unit, actual)}
                    </span>
                    <span className="text-sm text-slate-400">/ {formatValue(k.unit as Unit, k.goalValue)} goal</span>
                  </div>
                  <div className="relative mt-3 h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div className={`absolute inset-y-0 left-0 ${cls.dot}`} style={{ width: `${pct}%` }} />
                    <div className="absolute inset-y-0 w-0.5 bg-slate-500" style={{ left: `${pacePct}%` }} title="expected pace" />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Expected by today: {formatValue(k.unit as Unit, (k.goalValue ?? 0) * fraction)}
                  </p>
                </div>
              );
            })}
        </div>
      </section>
      )}

      {/* Computed ratios — company financials (managers only) */}
      {manager && (
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Computed ratios
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <tbody>
              {computedKpis.map((k) => {
                const v = k.formula ? computeDerived(k.formula, inputs) : null;
                return (
                  <tr key={k.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium"><KpiLabel kpiKey={k.key} name={k.name} /></td>
                    <td className="px-4 py-3 text-slate-400 hidden sm:table-cell">{k.definition}</td>
                    <td className="px-4 py-3 text-right font-bold text-lg">
                      {v === null ? "—" : formatValue(k.unit as Unit, v)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Total Leads this month: {totalLeads.toLocaleString()} · derived live from entered numbers.
        </p>
      </section>
      )}

      {/* Per-rep monthly totals — daily KPIs rolled up for the whole month (everyone) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Per-rep totals this month
        </h2>
        <div className="space-y-5">
          {POSITIONS.map((pos) => {
            const roleReps = reps.filter((r) => r.position === pos.key);
            const roleKpis = perRepKpis.filter((k) => k.roleKey === pos.key);
            if (roleReps.length === 0 || roleKpis.length === 0) return null;
            return (
              <RepRoleBars
                key={pos.key}
                emoji={pos.emoji}
                label={pos.label}
                reps={roleReps}
                kpis={roleKpis}
                cell={(repId, k) => {
                  const total = monthSums.get(`${k.id}|${repId}`) ?? 0;
                  const dailyGoal = k.goalKind === "at_least" ? resolveGoalWith(targets, k, repId, month) : null;
                  const monthlyGoal = dailyGoal != null && dailyGoal > 0 ? dailyGoal * workdaysInMonth : null;
                  const pct = monthlyGoal ? Math.min(100, (total / monthlyGoal) * 100) : null;
                  const status = monthlyGoal ? (total >= monthlyGoal ? "hit" : total >= monthlyGoal * 0.7 ? "close" : "miss") : "tracked";
                  return { value: total, pct, status, goalText: dailyGoal ? `/ ${formatValue(k.unit as Unit, dailyGoal)}/day` : undefined };
                }}
              />
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-400">Sum of each rep&apos;s daily entries for {month}. Goals shown are the daily target for reference.</p>
      </section>

      {/* Editable monthly inputs — company money, managers only */}
      {manager && (
        <EntryForm groups={[entryGroup]} date={monthStart} enteredBy="team" action={saveDay} />
      )}
    </div>
  );
}
