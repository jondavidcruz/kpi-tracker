import { getCurrentUser, canAccessPayroll } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveExpensesBulk, addExpenseLine, deleteExpenseLine, startExpenseMonth } from "@/app/actions";
import { EXPENSE_CATEGORIES, LEAD_KPI_KEYS } from "@/lib/expenses";
import { Card, SectionTitle } from "@/components/ui";
import ExpenseAdvisor from "@/components/ExpenseAdvisor";
import Link from "next/link";

export const dynamic = "force-dynamic";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmtMonth = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7))]} ${m.slice(0, 4)}`;
const addMonth = (m: string, d: number) => { const [y, mo] = m.split("-").map(Number); const dt = new Date(Date.UTC(y, mo - 1 + d, 1)); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`; };

// Literal Tailwind classes per category (so they aren't purged).
const CAT_COLOR: Record<string, { bar: string; text: string; soft: string; dot: string; ring: string }> = {
  payroll: { bar: "bg-indigo-500", text: "text-indigo-700", soft: "bg-indigo-50", dot: "bg-indigo-500", ring: "ring-indigo-100" },
  software: { bar: "bg-sky-500", text: "text-sky-700", soft: "bg-sky-50", dot: "bg-sky-500", ring: "ring-sky-100" },
  dues: { bar: "bg-amber-500", text: "text-amber-700", soft: "bg-amber-50", dot: "bg-amber-500", ring: "ring-amber-100" },
  realestate: { bar: "bg-emerald-500", text: "text-emerald-700", soft: "bg-emerald-50", dot: "bg-emerald-500", ring: "ring-emerald-100" },
  controllable: { bar: "bg-rose-500", text: "text-rose-700", soft: "bg-rose-50", dot: "bg-rose-500", ring: "ring-rose-100" },
};

// A friendly money input with a $ prefix.
function Money({ name, value, big, placeholder = "0" }: { name: string; value: number | null; big?: boolean; placeholder?: string }) {
  return (
    <div className={`flex items-center rounded-lg bg-white ring-1 ${big ? "ring-slate-300" : "ring-slate-200"}`}>
      <span className="pl-2 text-xs text-slate-400">$</span>
      <input
        name={name}
        defaultValue={value ? value : ""}
        placeholder={placeholder}
        inputMode="decimal"
        className={`bg-transparent px-1.5 py-1.5 text-right tabular-nums focus:outline-none ${big ? "w-24 text-base font-bold text-slate-800" : "w-20 text-sm text-slate-500"}`}
      />
    </div>
  );
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await getCurrentUser();
  if (!me || !canAccessPayroll(me)) {
    return <Card className="mx-auto max-w-md p-8 text-center text-slate-500">🔒 This page is restricted to the C-suite (Jon, Viktoriia, Enrico).</Card>;
  }
  const sp = await searchParams;

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
  const netSales = monthMeta?.netSales ?? 0;
  const netProfit = netSales - totalActual;
  const costPerLead = leads > 0 ? totalActual / leads : 0;

  // True lead cost = iSpeedToLead credit spend ÷ leads pulled. Credits are lumpy
  // (a $1k top-up every 2–3 months), so the honest figure is cumulative across all
  // tracked months, not this month alone.
  const speedLines = await db.expenseLine.findMany({ where: { label: { contains: "speed", mode: "insensitive" } }, select: { actual: true } });
  const leadCreditTotal = speedLines.reduce((s, l) => s + l.actual, 0);
  const earliest = months[months.length - 1] ?? month;
  const allLeadEntries = leadKpis.length
    ? await db.entry.findMany({ where: { kpiId: { in: leadKpis.map((k) => k.id) }, date: { gte: `${earliest}-01`, lte: `${months[0] ?? month}-31` } }, select: { value: true } })
    : [];
  const leadsAll = allLeadEntries.reduce((s, e) => s + e.value, 0);
  const trueCpl = leadsAll > 0 ? leadCreditTotal / leadsAll : 0;

  const margin = netSales > 0 ? (netProfit / netSales) * 100 : null;
  const maxIO = Math.max(netSales, totalActual, 1);

  // Per-category totals for the breakdown.
  const catTotals = EXPENSE_CATEGORIES.map((c) => ({ ...c, total: lines.filter((l) => l.category === c.key).reduce((s, l) => s + l.actual, 0) }));

  // Year-to-date truth: income only lands in the month a deal closed, so the real
  // picture is income-YTD vs expenses-YTD (this is where the actual loss shows).
  const year = month.slice(0, 4);
  const [ytdLineRows, ytdMonthRows] = await Promise.all([
    db.expenseLine.findMany({ where: { month: { startsWith: year } }, select: { actual: true } }),
    db.expenseMonth.findMany({ where: { month: { startsWith: year } }, select: { netSales: true } }),
  ]);
  const ytdExpenses = ytdLineRows.reduce((s, l) => s + l.actual, 0);
  const ytdIncome = ytdMonthRows.reduce((s, m) => s + m.netSales, 0);
  const ytdNet = ytdIncome - ytdExpenses;

  const advisorData = JSON.stringify({
    business: "San Diego real-estate wholesaling, small team, currently unprofitable",
    ytd: { income: Math.round(ytdIncome), expenses: Math.round(ytdExpenses), net: Math.round(ytdNet) },
    thisMonth: { label: fmtMonth(month), income: Math.round(netSales), expenses: Math.round(totalActual) },
    categories: catTotals.map((c) => ({ name: c.label, total: Math.round(c.total) })),
    topLines: [...lines].sort((a, b) => b.actual - a.actual).slice(0, 12).map((l) => ({ label: l.label, category: l.category, monthly: Math.round(l.actual) })),
  });

  const prevMonth = months.find((m) => m < month) ?? addMonth(month, -1);
  const nextNewMonth = addMonth(months[0] ?? month, 1);

  return (
    <div className="space-y-5 pb-24">
      <SectionTitle
        title="📊 Profit & Loss Report"
        subtitle="Income, expenses, and profit each month — like your accountant's P&L. Private to the C-suite."
        accent="bg-emerald-500"
        right={<span className="text-xs text-slate-400">Jon · Viktoriia · Enrico</span>}
      />

      {/* Month switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {months.map((m) => (
          <Link key={m} href={`/expenses?month=${m}`} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${m === month ? "bg-brand-navy text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{fmtMonth(m)}</Link>
        ))}
        {!months.includes(nextNewMonth) && (
          <form action={startExpenseMonth}>
            <input type="hidden" name="month" value={nextNewMonth} />
            <input type="hidden" name="from" value={months[0] ?? month} />
            <button className="rounded-full border border-dashed border-slate-300 px-3.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50">+ Start {fmtMonth(nextNewMonth)}</button>
          </form>
        )}
      </div>

      <form action={saveExpensesBulk}>
        <input type="hidden" name="month" value={month} />

        {/* ── The big picture: money in vs out ── */}
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">💵 Total income</div>
              <div className="mt-1 flex items-center gap-1">
                <Money name="netSales" value={netSales} big />
                <span className="text-xs text-slate-400">net sales</span>
              </div>
            </div>
            <div className="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-100">
              <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">🔻 Total expenses</div>
              <div className="mt-1 text-2xl font-extrabold tabular-nums text-rose-700">{usd(totalActual)}</div>
              <div className="text-[11px] text-slate-400">total spent this month</div>
            </div>
            <div className={`rounded-xl p-4 ring-1 ${netProfit >= 0 ? "bg-brand-navy text-white ring-brand-navy" : "bg-red-600 text-white ring-red-600"}`}>
              <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{netProfit >= 0 ? "✅ Profit" : "⚠️ Loss"}</div>
              <div className="mt-1 text-2xl font-extrabold tabular-nums">{usd(netProfit)}</div>
              <div className="text-[11px] opacity-70">{margin !== null ? `${margin.toFixed(0)}% margin` : "set net sales to see margin"}</div>
            </div>
          </div>

          {/* in vs out bars */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-3">
              <span className="w-16 text-[11px] font-semibold text-slate-400">In</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${(netSales / maxIO) * 100}%` }} /></div>
              <span className="w-20 text-right text-xs font-semibold tabular-nums text-slate-600">{usd(netSales)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-16 text-[11px] font-semibold text-slate-400">Out</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-rose-500" style={{ width: `${(totalActual / maxIO) * 100}%` }} /></div>
              <span className="w-20 text-right text-xs font-semibold tabular-nums text-slate-600">{usd(totalActual)}</span>
            </div>
          </div>

          {/* lead economics chips */}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 text-sm">
            <span className="rounded-lg bg-slate-50 px-3 py-1.5 text-slate-600">🎟️ <b className="tabular-nums">{leads.toLocaleString()}</b> leads this month</span>
            <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-emerald-800 ring-1 ring-emerald-100">🎯 True cost / lead <b className="tabular-nums">{leadsAll > 0 ? usd2(trueCpl) : "—"}</b></span>
            <span className="rounded-lg bg-slate-50 px-3 py-1.5 text-slate-600">📉 All-in cost / lead <b className="tabular-nums">{leads > 0 ? usd2(costPerLead) : "—"}</b></span>
            <span className="self-center text-[11px] text-slate-400">True = iSpeedToLead credits ÷ leads pulled (all months). All-in = every expense ÷ this month&apos;s leads.</span>
          </div>
        </Card>

        {/* ── Year to date — the real picture ── */}
        <Card className="mt-4 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-700">📅 Year to date ({year})</span>
            <span className="text-[11px] text-slate-400">Income only counts in the month a deal actually closed.</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Income YTD</div><div className="text-xl font-extrabold tabular-nums text-emerald-600">{usd(ytdIncome)}</div></div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Expenses YTD</div><div className="text-xl font-extrabold tabular-nums text-rose-600">{usd(ytdExpenses)}</div></div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Net YTD</div><div className={`text-xl font-extrabold tabular-nums ${ytdNet >= 0 ? "text-emerald-600" : "text-red-600"}`}>{usd(ytdNet)}</div></div>
          </div>
          {ytdNet < 0 && <p className="mt-2 text-[11px] font-semibold text-red-500">⚠️ Net negative for the year — expenses are outrunning closed income. A profitable month doesn&apos;t mean a profitable year. See the cut-the-fat ideas below.</p>}
        </Card>

        {/* ── Where the money goes (breakdown) ── */}
        {totalActual > 0 && (
          <Card className="mt-4 p-5">
            <div className="mb-2 text-sm font-bold text-slate-700">Where the money goes</div>
            <div className="flex h-4 overflow-hidden rounded-full">
              {catTotals.filter((c) => c.total > 0).map((c) => (
                <div key={c.key} className={CAT_COLOR[c.key].bar} style={{ width: `${(c.total / totalActual) * 100}%` }} title={`${c.label}: ${usd(c.total)}`} />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {catTotals.map((c) => (
                <div key={c.key} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${CAT_COLOR[c.key].dot}`} />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-slate-600">{c.label}</div>
                    <div className="text-[11px] tabular-nums text-slate-400">{usd(c.total)} · {totalActual > 0 ? Math.round((c.total / totalActual) * 100) : 0}%</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {lines.length === 0 ? (
          <Card className="mt-4 p-8 text-center text-slate-500">No expenses for {fmtMonth(month)} yet. Hit “+ Start {fmtMonth(nextNewMonth)}” above to copy last month&apos;s items, or add a line below.</Card>
        ) : (
          <Card className="mt-4 overflow-hidden p-0">
            {/* Statement header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
              <div>
                <div className="text-base font-bold text-slate-800">Profit &amp; Loss</div>
                <div className="text-[11px] text-slate-400">{fmtMonth(month)}</div>
              </div>
              <div className="hidden items-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:flex">
                <span className="w-24 text-center">Budget</span>
                <span className="w-28 text-center">Total</span>
                <span className="w-12 text-right">% inc</span>
                <span className="w-5" />
              </div>
            </div>

            {/* INCOME */}
            <div className="px-5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Income</div>
            <div className="flex items-center gap-3 px-5 py-1.5">
              <span className="min-w-0 flex-1 text-sm text-slate-700">Net sales</span>
              <span className="hidden w-24 sm:block" />
              <div className="w-28 text-right"><Money name="netSales" value={netSales} big /></div>
              <span className="w-12 text-right text-[11px] text-slate-400">100%</span>
              <span className="w-5" />
            </div>
            <div className="flex items-center gap-3 border-y border-slate-100 bg-slate-50/60 px-5 py-2">
              <span className="flex-1 text-sm font-bold text-slate-700">Total income</span>
              <span className="hidden w-24 sm:block" />
              <span className="w-28 text-right text-sm font-extrabold tabular-nums text-slate-900">{usd(netSales)}</span>
              <span className="w-12 text-right text-[11px] text-slate-400">100%</span>
              <span className="w-5" />
            </div>

            {/* EXPENSES */}
            <div className="px-5 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">Expenses</div>
            {EXPENSE_CATEGORIES.map((cat) => {
              const rows = lines.filter((l) => l.category === cat.key);
              if (rows.length === 0) return null;
              const spent = rows.reduce((s, l) => s + l.actual, 0);
              const catPct = netSales > 0 ? Math.round((spent / netSales) * 100) : null;
              return (
                <div key={cat.key}>
                  <div className="flex items-center gap-3 px-5 py-1.5">
                    <span className="flex-1 text-sm font-bold text-slate-700"><span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${CAT_COLOR[cat.key].dot}`} />{cat.label}</span>
                    <span className="hidden w-24 sm:block" />
                    <span className="w-28 text-right text-sm font-bold tabular-nums text-slate-800">{usd(spent)}</span>
                    <span className="w-12 text-right text-[11px] text-slate-400">{catPct != null ? `${catPct}%` : ""}</span>
                    <span className="w-5" />
                  </div>
                  {rows.map((l) => {
                    const linePct = netSales > 0 ? Math.round((l.actual / netSales) * 100) : null;
                    return (
                      <div key={l.id} className="flex items-center gap-3 px-5 py-1 pl-9">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-slate-600">{l.label}</div>
                          <input name={`note_${l.id}`} defaultValue={l.note} placeholder="add a note…" className="w-full bg-transparent text-[11px] text-slate-400 placeholder:text-slate-300 focus:outline-none" />
                        </div>
                        <div className="hidden w-24 sm:block"><Money name={`projected_${l.id}`} value={l.projected} /></div>
                        <div className="w-28 text-right"><Money name={`actual_${l.id}`} value={l.actual} big /></div>
                        <span className="w-12 text-right text-[11px] text-slate-400">{linePct != null ? `${linePct}%` : ""}</span>
                        <input type="hidden" name={`withTax_${l.id}`} value={l.withTax ?? ""} />
                        <button name="id" value={l.id} formAction={deleteExpenseLine} formNoValidate className="w-5 text-slate-300 hover:text-red-600" title="delete line">×</button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <div className="flex items-center gap-3 border-y border-slate-100 bg-slate-50/60 px-5 py-2">
              <span className="flex-1 text-sm font-bold text-slate-700">Total expenses</span>
              <span className="hidden w-24 sm:block" />
              <span className="w-28 text-right text-sm font-extrabold tabular-nums text-rose-700">{usd(totalActual)}</span>
              <span className="w-12 text-right text-[11px] text-slate-400">{netSales > 0 ? `${Math.round((totalActual / netSales) * 100)}%` : ""}</span>
              <span className="w-5" />
            </div>

            {/* NET INCOME */}
            <div className={`flex items-center gap-3 border-t-2 px-5 py-3 ${netProfit >= 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
              <span className="flex-1 text-base font-extrabold text-slate-800">Net income</span>
              <span className="hidden w-24 sm:block" />
              <span className={`w-28 text-right text-lg font-extrabold tabular-nums ${netProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{usd(netProfit)}</span>
              <span className="w-12 text-right text-[11px] font-semibold text-slate-500">{margin != null ? `${Math.round(margin)}%` : ""}</span>
              <span className="w-5" />
            </div>
          </Card>
        )}

        {/* sticky save bar */}
        {lines.length > 0 && (
          <div className="sticky bottom-3 mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
            <div className="text-sm text-slate-500">Spent <b className="tabular-nums text-rose-600">{usd(totalActual)}</b> · Profit <b className={`tabular-nums ${netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{usd(netProfit)}</b></div>
            <button className="rounded-lg bg-brand-navy px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-700">💾 Save {fmtMonth(month)}</button>
          </div>
        )}
      </form>

      {/* Add a custom line */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-bold text-slate-700">➕ Add an expense</div>
        <form action={addExpenseLine} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="month" value={month} />
          <select name="category" defaultValue="software" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {EXPENSE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
          </select>
          <input name="label" placeholder="What's it for? (e.g. Zillow ads)" required className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="actual" placeholder="$ spent" className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm tabular-nums" inputMode="decimal" />
          <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900">Add</button>
        </form>
        <p className="mt-2 text-[11px] text-slate-400"><b>Spent</b> = what actually left the bank this month (drives profit + cost-per-lead). <b>Budget</b> = what you planned. <b>+ Tax</b> = the all-in figure from your tracker. Prior month: <Link href={`/expenses?month=${prevMonth}`} className="underline">{fmtMonth(prevMonth)}</Link>.</p>
      </Card>

      {/* Cut-the-fat AI advisor */}
      <ExpenseAdvisor data={advisorData} />
    </div>
  );
}
