import { saveDay } from "@/app/actions";
import EntryForm, { type EntryGroup } from "@/components/EntryForm";
import { db } from "@/lib/db";
import { getKpis, getMonthlyValues, getSettings } from "@/lib/data";
import { todayStr, monthBounds, monthOf, daysInMonth, dayOfMonth } from "@/lib/date";
import { formatValue, toInputNumber, type Unit } from "@/lib/format";
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
  const { end: monthEnd } = monthBounds(monthStart);
  const isCurrentMonth = month === monthOf(today);
  const fraction = isCurrentMonth ? dayOfMonth(today) / daysInMonth(today) : 1;

  const [enteredKpis, computedKpis, monthlyValues] = await Promise.all([
    getKpis({ scope: "team", cadence: "monthly", computed: false }),
    getKpis({ scope: "team", cadence: "monthly", computed: true }),
    getMonthlyValues(monthStart),
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

      {/* Pace summary for goal-bearing monthly KPIs */}
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
                    <span className="text-sm font-medium text-slate-600">{k.emoji} {k.name}</span>
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

      {/* Computed ratios — always correct, never #DIV/0! */}
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
                    <td className="px-4 py-3 font-medium">{k.emoji} {k.name}</td>
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

      {/* Editable monthly inputs */}
      <EntryForm groups={[entryGroup]} date={monthStart} enteredBy="team" action={saveDay} />
    </div>
  );
}
