import { getCurrentUser, canAccessPayroll } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveExpensesBulk, addExpenseLine, deleteExpenseLine, startExpenseMonth } from "@/app/actions";
import { EXPENSE_CATEGORIES, LEAD_KPI_KEYS } from "@/lib/expenses";
import { Card, SectionTitle } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const inputCls = "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-200";
const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmtMonth = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7))]} ${m.slice(0, 4)}`;
const addMonth = (m: string, d: number) => { const [y, mo] = m.split("-").map(Number); const dt = new Date(Date.UTC(y, mo - 1 + d, 1)); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`; };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await getCurrentUser();
  if (!me || !canAccessPayroll(me)) {
    return <Card className="mx-auto max-w-md p-8 text-center text-slate-500">🔒 This page is restricted to the C-suite (Jon, Viktoriia, Enrico).</Card>;
  }
  const sp = await searchParams;

  // Available months (from expense rows), newest first.
  const monthRows = await db.expenseLine.findMany({ select: { month: true }, distinct: ["month"], orderBy: { month: "desc" } });
  const months = monthRows.map((r) => r.month);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : months[0] ?? `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;

  const [lines, monthMeta, leadKpis] = await Promise.all([
    db.expenseLine.findMany({ where: { month }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
    db.expenseMonth.findUnique({ where: { month } }),
    db.kpi.findMany({ where: { key: { in: LEAD_KPI_KEYS } }, select: { id: true } }),
  ]);
  const leadEntries = leadKpis.length
    ? await db.entry.findMany({ where: { kpiId: { in: leadKpis.map((k) => k.id) }, date: { gte: `${month}-01`, lte: `${month}-31` } }, select: { value: true } })
    : [];
  const leads = leadEntries.reduce((s, e) => s + e.value, 0);

  const totalActual = lines.reduce((s, l) => s + l.actual, 0);
  const totalProjected = lines.reduce((s, l) => s + l.projected, 0);
  const totalWithTax = lines.reduce((s, l) => s + (l.withTax ?? l.actual), 0);
  const netSales = monthMeta?.netSales ?? 0;
  const netProfit = netSales - totalActual;
  const costPerLead = leads > 0 ? totalActual / leads : 0;

  const prevMonth = months.find((m) => m < month) ?? addMonth(month, -1);
  const nextNewMonth = addMonth(months[0] ?? month, 1);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="🧾 Expenses & P&L"
        subtitle="Private to the C-suite. Tracks every cost so cost-per-lead and profit stay accurate."
        accent="bg-emerald-500"
        right={<span className="text-xs text-slate-400">Visible to Jon, Viktoriia, Enrico</span>}
      />

      {/* Month switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {months.map((m) => (
          <Link key={m} href={`/expenses?month=${m}`} className={`rounded-full px-3 py-1.5 text-sm font-medium ${m === month ? "bg-brand-navy text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{fmtMonth(m)}</Link>
        ))}
        {!months.includes(nextNewMonth) && (
          <form action={startExpenseMonth}>
            <input type="hidden" name="month" value={nextNewMonth} />
            <input type="hidden" name="from" value={months[0] ?? month} />
            <button className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50">+ Start {fmtMonth(nextNewMonth)}</button>
          </form>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card className="p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Net sales</div><div className="mt-0.5 text-2xl font-extrabold tabular-nums text-slate-800">{usd(netSales)}</div></Card>
        <Card className="p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total expenses</div><div className="mt-0.5 text-2xl font-extrabold tabular-nums text-slate-800">{usd(totalActual)}</div></Card>
        <Card className="p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Net profit</div><div className={`mt-0.5 text-2xl font-extrabold tabular-nums ${netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{usd(netProfit)}</div></Card>
        <Card className="p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Leads</div><div className="mt-0.5 text-2xl font-extrabold tabular-nums text-slate-800">{leads.toLocaleString()}</div></Card>
        <Card className="p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cost / lead</div><div className="mt-0.5 text-2xl font-extrabold tabular-nums text-slate-800">{leads > 0 ? usd(costPerLead) : "—"}</div><div className="text-[10px] text-slate-400">total spend ÷ leads</div></Card>
      </div>

      {lines.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">No expense lines for {fmtMonth(month)} yet. Start the month above (copies the prior month&apos;s lines) or add lines below.</Card>
      ) : (
        <form action={saveExpensesBulk}>
          <input type="hidden" name="month" value={month} />
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Line item</th>
                  <th className="px-2 py-2 text-right font-semibold">Projected</th>
                  <th className="px-2 py-2 text-right font-semibold">Actual</th>
                  <th className="px-2 py-2 text-right font-semibold">With tax</th>
                  <th className="px-2 py-2 text-left font-semibold">Note</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              {EXPENSE_CATEGORIES.map((cat) => {
                const rows = lines.filter((l) => l.category === cat.key);
                if (rows.length === 0) return null;
                const sub = rows.reduce((s, l) => s + l.actual, 0);
                return (
                  <tbody key={cat.key} className="divide-y divide-slate-100 border-t border-slate-100">
                    <tr className="bg-slate-50/60"><td colSpan={6} className="px-3 py-1.5 text-xs font-bold text-brand-navy">{cat.emoji} {cat.label} <span className="font-normal text-slate-400">· {usd(sub)}</span></td></tr>
                    {rows.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/50">
                        <td className="px-3 py-1.5 text-slate-700">{l.label}</td>
                        <td className="px-2 py-1"><input name={`projected_${l.id}`} defaultValue={l.projected || ""} className={inputCls} inputMode="decimal" /></td>
                        <td className="px-2 py-1"><input name={`actual_${l.id}`} defaultValue={l.actual || ""} className={inputCls} inputMode="decimal" /></td>
                        <td className="px-2 py-1"><input name={`withTax_${l.id}`} defaultValue={l.withTax ?? ""} placeholder="—" className={inputCls} inputMode="decimal" /></td>
                        <td className="px-2 py-1"><input name={`note_${l.id}`} defaultValue={l.note} className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-slate-200" /></td>
                        <td className="px-2 py-1 text-center"><button name="id" value={l.id} formAction={deleteExpenseLine} formNoValidate className="text-slate-300 hover:text-red-600" title="delete line">×</button></td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-800">
                <tr>
                  <td className="px-3 py-2">Grand total</td>
                  <td className="px-2 py-2 text-right tabular-nums">{usd(totalProjected)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{usd(totalActual)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-500">{usd(totalWithTax)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </Card>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Net sales this month
              <input name="netSales" defaultValue={netSales || ""} className={`${inputCls} w-32`} inputMode="decimal" />
            </label>
            <button className="rounded-lg bg-brand-navy px-5 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Save {fmtMonth(month)}</button>
          </div>
        </form>
      )}

      {/* Add a custom line */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-bold text-slate-700">➕ Add a line item</div>
        <form action={addExpenseLine} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="month" value={month} />
          <select name="category" defaultValue="software" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            {EXPENSE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input name="label" placeholder="Line item name" required className="min-w-48 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <input name="actual" placeholder="Actual $" className={`${inputCls} w-28`} inputMode="decimal" />
          <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900">Add</button>
        </form>
        <p className="mt-2 text-[11px] text-slate-400">Prior month: <Link href={`/expenses?month=${prevMonth}`} className="underline">{fmtMonth(prevMonth)}</Link>. The “with tax” column is yours to fill from the tracker; cost-per-lead uses the Actual figure.</p>
      </Card>
    </div>
  );
}
