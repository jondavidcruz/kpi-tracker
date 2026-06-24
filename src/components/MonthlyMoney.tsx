import { saveDay } from "@/app/actions";
import EntryForm, { type EntryGroup } from "@/components/EntryForm";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";
import { getKpis, getMonthlyValues, getSettings } from "@/lib/data";
import { todayStr, monthBounds, monthOf } from "@/lib/date";
import { formatValue, toInputNumber, type Unit } from "@/lib/format";
import { KpiLabel } from "@/lib/kpiIcons";
import { computeDerived, type MonthlyInputs } from "@/lib/kpi";

// Monthly company money — moved here from the old standalone Monthly Financials page so
// all leadership financials live in War Room Health. Editable inputs + computed ratios.
export default async function MonthlyMoney() {
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const month = monthOf(today);
  const monthStart = `${month}-01`;
  const { end: monthEnd } = monthBounds(monthStart);

  const [enteredKpis, computedKpis, monthlyValues] = await Promise.all([
    getKpis({ scope: "team", cadence: "monthly", computed: false }),
    getKpis({ scope: "team", cadence: "monthly", computed: true }),
    getMonthlyValues(monthStart),
  ]);

  const leadKpis = await db.kpi.findMany({ where: { key: { in: ["leads_generated", "ppl_leads"] } } });
  const leadEntries = leadKpis.length
    ? await db.entry.findMany({ where: { kpiId: { in: leadKpis.map((k) => k.id) }, date: { gte: monthStart, lte: monthEnd } } })
    : [];
  const totalLeads = leadEntries.reduce((s, e) => s + e.value, 0);

  // ── Auto-fill from data we already track ───────────────────────────────────
  // Deals closed + gross revenue from ClosedDeal; contracts from the synced KPI
  // entries; operating expenses from the P&L expense lines.
  const y = +month.slice(0, 4), mo = +month.slice(5, 7);
  const [closed, contractKpis, expCount, expSum] = await Promise.all([
    db.closedDeal.aggregate({ where: { year: y, month: mo }, _count: { _all: true }, _sum: { profit: true } }),
    db.kpi.findMany({ where: { key: { in: ["acq_contracts_sent", "contracts_signed"] } }, select: { id: true, key: true } }),
    db.expenseLine.count({ where: { month } }),
    db.expenseLine.aggregate({ where: { month }, _sum: { actual: true } }),
  ]);
  const cEntries = contractKpis.length
    ? await db.entry.findMany({ where: { kpiId: { in: contractKpis.map((k) => k.id) }, date: { gte: monthStart, lte: monthEnd } }, select: { kpiId: true, value: true } })
    : [];
  const keyByKpiId = new Map(contractKpis.map((k) => [k.id, k.key]));
  const contractSums: Record<string, number> = {};
  for (const e of cEntries) { const key = keyByKpiId.get(e.kpiId); if (key) contractSums[key] = (contractSums[key] ?? 0) + e.value; }

  // Only auto-fill a field when we genuinely have the data behind it.
  const AUTO: Record<string, number> = {
    deals_closed: closed._count._all,
    gross_revenue: closed._sum.profit ?? 0,
    acq_contracts_sent: contractSums.acq_contracts_sent ?? 0,
    contracts_signed: contractSums.contracts_signed ?? 0,
    ...(expCount > 0 ? { operating_expenses: expSum._sum.actual ?? 0 } : {}),
  };

  const byKey = new Map(enteredKpis.map((k) => [k.key, k]));
  const valOf = (key: string) => {
    const k = byKey.get(key);
    const manual = k ? monthlyValues.get(k.id) : undefined;
    return manual !== undefined ? manual : (AUTO[key] ?? 0);
  };
  const inputs: MonthlyInputs = {
    totalLeads,
    dealsClosed: valOf("deals_closed"),
    grossRevenue: valOf("gross_revenue"),
    marketingSpend: valOf("marketing_spend"),
    operatingExpenses: valOf("operating_expenses"),
  };

  const entryGroup: EntryGroup = {
    title: "Monthly money",
    hint: "🟢 auto = filled from data we already track (deals, revenue, contracts, expenses). 🔴 needs entry = no data source, type it in.",
    items: enteredKpis.map((k) => {
      const manual = monthlyValues.get(k.id);
      const hasManual = manual !== undefined;
      const auto = AUTO[k.key];
      const val = hasManual ? manual : auto;
      return {
        kpiId: k.id, kpiKey: k.key, name: k.name, emoji: k.emoji, unit: k.unit as Unit,
        goalValue: k.goalValue, goalKind: k.goalKind, userId: "",
        initial: val !== undefined ? toInputNumber(k.unit as Unit, val) : "",
        auto: !hasManual && auto !== undefined,
      };
    }),
  };

  return (
    <Card className="p-5">
      <div className="mb-1 text-base font-bold text-slate-800">💵 Monthly P&amp;L — {month}</div>
      <p className="mb-3 text-xs text-slate-400">Manual company money for the month. Unit economics above already pull live from deals + expenses — fill these in only if you want the computed ratios.</p>

      <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <tbody>
            {computedKpis.map((k) => {
              const v = k.formula ? computeDerived(k.formula, inputs) : null;
              return (
                <tr key={k.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium"><KpiLabel kpiKey={k.key} name={k.name} /></td>
                  <td className="hidden px-4 py-2.5 text-slate-400 sm:table-cell">{k.definition}</td>
                  <td className="px-4 py-2.5 text-right text-lg font-bold">{v === null ? "—" : formatValue(k.unit as Unit, v)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <EntryForm groups={[entryGroup]} date={monthStart} enteredBy="team" action={saveDay} />
    </Card>
  );
}
