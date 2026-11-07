import { Card } from "@/components/ui";
import { savePnlAssumptions } from "@/app/actions";
import { type PnlMonth, type PnlAssumptions, type PnlSummary, SHEET_URL } from "@/lib/pnl-sheet";

// 📗 Financial Health cockpit — the visual Jon asked for (2026-11-07): burn rate, runway, cost to keep
// the business running, and how much he needs to close per month. Fed by the P&L Excel sheet (synced
// monthly) + three owner-entered assumptions (cash on hand, avg fee, profit target). Sits at the TOP of
// the existing /expenses P&L page (extends it, doesn't duplicate — the detailed line editor stays below).

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const MONTH3 = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function FinancialHealth({ pnl, summary, assume, saved, asOf }: {
  pnl: PnlMonth[]; summary: PnlSummary; assume: PnlAssumptions; saved?: boolean; asOf?: string;
}) {
  const s = summary;
  const runwayLabel = s.runwayMonths == null ? "—" : s.runwayMonths >= 24 ? "24+ mo" : `${s.runwayMonths.toFixed(1)} mo`;
  const runwayTone = s.runwayMonths == null ? "slate" : s.runwayMonths < 3 ? "red" : s.runwayMonths < 6 ? "amber" : "emerald";
  const toneRing: Record<string, string> = { red: "ring-red-200 bg-red-50", amber: "ring-amber-200 bg-amber-50", emerald: "ring-emerald-200 bg-emerald-50", slate: "ring-slate-200 bg-slate-50" };
  const toneText: Record<string, string> = { red: "text-red-700", amber: "text-amber-700", emerald: "text-emerald-700", slate: "text-slate-500" };

  const closed = pnl.filter((r) => r.expenses > 0);
  const maxAbs = Math.max(1, ...closed.map((r) => Math.abs(r.netProfit)), ...closed.map((r) => r.expenses));

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-base font-extrabold text-slate-800">📗 Financial Health</div>
          <div className="text-[11px] text-slate-400">The real cost to run Freedom Offers — synced from your P&amp;L Excel{asOf ? ` · as of ${asOf}` : ""}. <a href={SHEET_URL} target="_blank" rel="noreferrer" className="underline hover:text-slate-600">open sheet ↗</a></div>
        </div>
        {saved && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">✓ Saved</span>}
      </div>

      {/* The four numbers Jon asked for */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-100">
          <div className="text-[11px] font-bold uppercase tracking-wide text-rose-700">🔥 Burn rate</div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums text-rose-700">{usd(s.burnRate)}<span className="text-sm font-semibold text-rose-400">/mo</span></div>
          <div className="text-[11px] text-slate-400">avg last 3 months of spend</div>
        </div>
        <div className={`rounded-xl p-4 ring-1 ${toneRing[runwayTone]}`}>
          <div className={`text-[11px] font-bold uppercase tracking-wide ${toneText[runwayTone]}`}>🛟 Runway</div>
          <div className={`mt-1 text-2xl font-extrabold tabular-nums ${toneText[runwayTone]}`}>{runwayLabel}</div>
          <div className="text-[11px] text-slate-400">{s.runwayMonths == null ? "enter cash on hand below" : "at current burn, no new income"}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">🏃 Cost to run</div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums text-slate-800">{usd(s.annualRunCost)}<span className="text-sm font-semibold text-slate-400">/yr</span></div>
          <div className="text-[11px] text-slate-400">{usd(s.burnRate)}/mo to keep the lights on</div>
        </div>
        <div className="rounded-xl bg-brand-navy p-4 text-white ring-1 ring-brand-navy">
          <div className="text-[11px] font-bold uppercase tracking-wide opacity-80">🎯 Close to break even</div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums">{usd(s.breakevenRevenue)}<span className="text-sm font-semibold opacity-70">/mo</span></div>
          <div className="text-[11px] opacity-80">≈ <b>{s.dealsToBreakeven.toFixed(1)}</b> deals/mo @ {usd(assume.avgFee)}{assume.profitTarget > 0 ? ` · ${s.dealsToTarget.toFixed(1)} to hit +${usd(assume.profitTarget)}` : ""}</div>
        </div>
      </div>

      {/* Net profit by month — the trend */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Net profit by month ({pnl[0]?.month.slice(0, 4)})</div>
          <div className="text-xs text-slate-500">YTD net <b className={`tabular-nums ${s.ytdNet >= 0 ? "text-emerald-600" : "text-red-600"}`}>{usd(s.ytdNet)}{s.ytdNet < 0 ? " (loss)" : ""}</b> · rev <b className="tabular-nums text-emerald-600">{usd(s.ytdRevenue)}</b> · exp <b className="tabular-nums text-rose-600">{usd(s.ytdExpenses)}</b></div>
        </div>
        <div className="mt-3 flex items-end gap-1.5" style={{ height: 120 }}>
          {pnl.map((r) => {
            const isClosed = r.expenses > 0;
            const h = isClosed ? Math.max(3, (Math.abs(r.netProfit) / maxAbs) * 52) : 3;
            const pos = r.netProfit >= 0;
            return (
              <div key={r.month} className="flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }} title={isClosed ? `${MONTH3[Number(r.month.slice(5))]}: net ${usd(r.netProfit)} · rev ${usd(r.revenue)} · exp ${usd(r.expenses)}` : `${MONTH3[Number(r.month.slice(5))]}: not closed yet`}>
                <div className="flex w-full flex-1 flex-col items-center justify-end">
                  {isClosed && pos && <div className="w-full max-w-7 rounded-t bg-emerald-500" style={{ height: h }} />}
                </div>
                <div className="my-0.5 h-px w-full bg-slate-200" />
                <div className="flex w-full flex-1 flex-col items-center justify-start">
                  {isClosed && !pos && <div className="w-full max-w-7 rounded-b bg-rose-400" style={{ height: h }} />}
                  {!isClosed && <div className="w-full max-w-7 rounded bg-slate-100" style={{ height: 3 }} />}
                </div>
                <div className="mt-0.5 text-[9px] font-semibold text-slate-400">{MONTH3[Number(r.month.slice(5))]}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Owner inputs that aren't in the sheet */}
      <form action={savePnlAssumptions} className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
        <label className="block">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">💵 Cash on hand</span>
          <div className="mt-1 flex items-center rounded-lg bg-white ring-1 ring-slate-300"><span className="pl-2 text-xs text-slate-400">$</span>
            <input name="cashOnHand" defaultValue={assume.cashOnHand || ""} inputMode="decimal" placeholder="bank balance" className="w-32 bg-transparent px-1.5 py-1.5 text-right text-sm font-bold tabular-nums focus:outline-none" /></div>
        </label>
        <label className="block">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">🤝 Avg fee / deal</span>
          <div className="mt-1 flex items-center rounded-lg bg-white ring-1 ring-slate-300"><span className="pl-2 text-xs text-slate-400">$</span>
            <input name="avgFee" defaultValue={assume.avgFee || ""} inputMode="decimal" placeholder="10000" className="w-28 bg-transparent px-1.5 py-1.5 text-right text-sm font-bold tabular-nums focus:outline-none" /></div>
        </label>
        <label className="block">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">📈 Monthly profit target</span>
          <div className="mt-1 flex items-center rounded-lg bg-white ring-1 ring-slate-300"><span className="pl-2 text-xs text-slate-400">$</span>
            <input name="profitTarget" defaultValue={assume.profitTarget || ""} inputMode="decimal" placeholder="0" className="w-28 bg-transparent px-1.5 py-1.5 text-right text-sm font-bold tabular-nums focus:outline-none" /></div>
        </label>
        <button className="rounded-lg bg-brand-navy px-5 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">💾 Save</button>
        <span className="text-[11px] text-slate-400">Cash on hand drives <b>runway</b>; avg fee drives <b>deals-to-close</b>. The sheet drives everything else.</span>
      </form>
    </Card>
  );
}
