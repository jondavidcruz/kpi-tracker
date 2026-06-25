import { Card } from "@/components/ui";

const usd0 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const CAT_BAR: Record<string, string> = { indigo: "bg-indigo-500", sky: "bg-sky-500", amber: "bg-amber-500", emerald: "bg-emerald-500", rose: "bg-rose-500", violet: "bg-violet-500", slate: "bg-slate-400" };
const fmtMon = (m: string) => ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m.slice(5, 7))];

export type CatTotal = { key: string; label: string; emoji: string; color: string; total: number };
export type TrendPoint = { month: string; income: number; expense: number };

// Visual P&L: where the money goes (category mix) + income-vs-expense over time.
export default function PnlCharts({ categories, trend }: { categories: CatTotal[]; trend: TrendPoint[] }) {
  const catTotal = categories.reduce((s, c) => s + c.total, 0) || 1;
  const ranked = [...categories].sort((a, b) => b.total - a.total);
  const peak = Math.max(1, ...trend.map((t) => Math.max(t.income, t.expense)));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Where the money goes */}
      <Card className="p-5">
        <div className="mb-3 text-sm font-bold text-slate-700">🔻 Where the money goes (this month)</div>
        <div className="space-y-2.5">
          {ranked.map((c) => (
            <div key={c.key} className="flex items-center gap-3">
              <div className="w-28 shrink-0 truncate text-xs font-medium text-slate-600">{c.emoji} {c.label}</div>
              <div className="h-5 flex-1 overflow-hidden rounded-md bg-slate-100">
                <div className={`flex h-full items-center justify-end rounded-md px-1.5 text-[10px] font-bold text-white ${CAT_BAR[c.color] ?? "bg-slate-400"}`} style={{ width: `${Math.max(3, (c.total / catTotal) * 100)}%` }}>
                  {c.total / catTotal >= 0.12 ? `${Math.round((c.total / catTotal) * 100)}%` : ""}
                </div>
              </div>
              <div className="w-20 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">{usd0(c.total)}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Income vs expense over time */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-bold text-slate-700">📈 Income vs expenses by month</div>
          <div className="flex gap-3 text-[10px] text-slate-500"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> income</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> expense</span></div>
        </div>
        {trend.length === 0 ? (
          <p className="text-xs text-slate-400">No months recorded yet.</p>
        ) : (
          <div className="flex items-end justify-between gap-2" style={{ height: 140 }}>
            {trend.slice(-8).map((t) => {
              const net = t.income - t.expense;
              return (
                <div key={t.month} className="flex flex-1 flex-col items-center gap-1" title={`${fmtMon(t.month)} ${t.month.slice(0, 4)} · in ${usd0(t.income)} · out ${usd0(t.expense)} · net ${usd0(net)}`}>
                  <div className="flex h-[104px] w-full items-end justify-center gap-0.5">
                    <div className="w-1/2 rounded-t bg-emerald-500" style={{ height: `${(t.income / peak) * 100}%` }} />
                    <div className="w-1/2 rounded-t bg-rose-500" style={{ height: `${(t.expense / peak) * 100}%` }} />
                  </div>
                  <div className={`text-[9px] font-bold tabular-nums ${net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{net >= 0 ? "+" : "−"}{usd0(Math.abs(net)).replace("$", "")}</div>
                  <div className="text-[10px] text-slate-500">{fmtMon(t.month)}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
