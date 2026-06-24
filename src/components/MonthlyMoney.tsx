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

  const byKey = new Map(enteredKpis.map((k) => [k.key, k]));
  const valOf = (key: string) => { const k = byKey.get(key); return k ? monthlyValues.get(k.id) ?? 0 : 0; };
  const inputs: MonthlyInputs = {
    totalLeads,
    dealsClosed: valOf("deals_closed"),
    grossRevenue: valOf("gross_revenue"),
    marketingSpend: valOf("marketing_spend"),
    operatingExpenses: valOf("operating_expenses"),
  };

  const entryGroup: EntryGroup = {
    title: "Monthly money",
    hint: "Entered once per month for the whole company.",
    items: enteredKpis.map((k) => ({
      kpiId: k.id, kpiKey: k.key, name: k.name, emoji: k.emoji, unit: k.unit as Unit,
      goalValue: k.goalValue, goalKind: k.goalKind, userId: "",
      initial: toInputNumber(k.unit as Unit, monthlyValues.get(k.id)),
    })),
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
