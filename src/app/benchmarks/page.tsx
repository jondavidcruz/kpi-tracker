import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isManager, canAccessPayroll } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { todayStr, monthOf, friendlyDate } from "@/lib/date";
import { saveBenchmarkInputs } from "@/app/actions";
import { Card, SectionTitle, MetricCard } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;
const SRC_LABEL: Record<string, string> = { ppl: "PPL", sms: "SMS", mail: "Direct mail", cold_call: "Cold call", referral: "Referral", other: "Other", "": "Unattributed" };
// Normalize free-text/legacy source strings into canonical buckets.
function normSource(s: string): string {
  const x = (s || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (x.includes("ppl") || x.includes("pay_per") || x.includes("paid")) return "ppl";
  if (x.includes("cold")) return "cold_call";
  if (x.includes("sms") || x.includes("text")) return "sms";
  if (x.includes("mail")) return "mail";
  if (x.includes("refer")) return "referral";
  return x && x !== "other" ? "other" : "";
}
const FALLOUT_LABEL: Record<string, string> = { financing: "Financing", title: "Title", seller: "Seller backed out", inspection: "Inspection", no_buyer: "No buyer", other: "Other", "": "Unspecified" };

export default async function BenchmarksPage() {
  const me = await getCurrentUser();
  const cSuite = canAccessPayroll(me); // expense/spend/profit figures are C-suite only
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Benchmarks — restricted</h1>
        <p className="mt-1 text-sm text-slate-500">Managers only.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const month = monthOf(today);
  const monthStart = `${month}-01`;
  const year = today.slice(0, 4);
  const yearStart = `${year}-01-01`;

  // KPI entries (month + year) for leads, spend, email, contracts.
  const KEYS = ["ppl_leads", "text_responses", "direct_mail_responses", "spend_ppl", "spend_sms", "spend_mail", "email_open_rate", "email_ctr", "operating_expenses", "acq_signed_assignment", "acq_signed_novation", "acq_signed_listing", "acq_signed_creative"];
  const kpis = await db.kpi.findMany({ where: { key: { in: KEYS } }, select: { id: true, key: true } });
  const idToKey = new Map(kpis.map((k) => [k.id, k.key]));
  const ids = kpis.map((k) => k.id);
  const [monthEntries, yearEntries, closings, buyers, deals, ledger] = await Promise.all([
    db.entry.findMany({ where: { kpiId: { in: ids }, date: { gte: monthStart, lte: today } }, select: { kpiId: true, value: true } }),
    db.entry.findMany({ where: { kpiId: { in: ids }, date: { gte: yearStart, lte: today } }, select: { kpiId: true, value: true } }),
    db.closing.findMany({ include: { expenses: true } }),
    db.marketContact.findMany({ select: { vetStage: true } }),
    db.deal.findMany({ select: { contractDate: true, soldDate: true } }),
    db.closedDeal.findMany({ select: { profit: true, leadSource: true } }),
  ]);
  const sumBy = (rows: { kpiId: string; value: number }[]) => {
    const m: Record<string, number> = {};
    for (const r of rows) { const k = idToKey.get(r.kpiId); if (k) m[k] = (m[k] ?? 0) + r.value; }
    return m;
  };
  const mo = sumBy(monthEntries), yr = sumBy(yearEntries);
  const mv = (k: string) => mo[k] ?? 0;
  const signedKeys = ["acq_signed_assignment", "acq_signed_novation", "acq_signed_listing", "acq_signed_creative"];

  // Marketing — this month
  const leadsByCh = { ppl: mv("ppl_leads"), sms: mv("text_responses"), mail: mv("direct_mail_responses") };
  const spendByCh = { ppl: mv("spend_ppl"), sms: mv("spend_sms"), mail: mv("spend_mail") };
  const leadsTotal = leadsByCh.ppl + leadsByCh.sms + leadsByCh.mail;
  const spendTotal = spendByCh.ppl + spendByCh.sms + spendByCh.mail;
  const contractsMonth = signedKeys.reduce((s, k) => s + mv(k), 0);
  const contractsYear = signedKeys.reduce((s, k) => s + (yr[k] ?? 0), 0);
  const cpl = (sp: number, ld: number) => (ld > 0 ? sp / ld : 0);
  const costPerContract = contractsMonth > 0 ? spendTotal / contractsMonth : 0;

  // Closings — year to date
  const inYear = (c: (typeof closings)[number]) => (c.closeDate ? c.closeDate >= yearStart && c.closeDate <= `${year}-12-31` : true);
  const closedYTD = closings.filter((c) => c.status === "closed" && inYear(c));
  const netOf = (c: (typeof closings)[number]) => c.revenue - c.expenses.reduce((s, e) => s + e.amount, 0);
  const closedCount = closedYTD.length;
  const grossRev = closedYTD.reduce((s, c) => s + c.revenue, 0);
  const netProfit = closedYTD.reduce((s, c) => s + netOf(c), 0);
  const netPerDeal = closedCount > 0 ? netProfit / closedCount : 0;
  const assignments = closedYTD.filter((c) => c.exit === "assignment");
  const avgAssignFee = assignments.length ? assignments.reduce((s, c) => s + c.revenue, 0) / assignments.length : 0;
  const contractToClose = contractsYear > 0 ? closedCount / contractsYear : 0;
  // Avg days in escrow (open → close)
  const dayDiffs = closedYTD.map((c) => (c.openedDate && c.closeDate ? (Date.parse(c.closeDate) - Date.parse(c.openedDate)) / 86400000 : NaN)).filter((d) => Number.isFinite(d) && d >= 0);
  const avgEscrowDays = dayDiffs.length ? dayDiffs.reduce((s, d) => s + d, 0) / dayDiffs.length : 0;
  // Revenue/profit/ROI for the month
  const closedMonth = closings.filter((c) => c.status === "closed" && c.closeDate && c.closeDate >= monthStart && c.closeDate <= today);
  const monthRev = closedMonth.reduce((s, c) => s + c.revenue, 0);
  const opexMonth = mv("operating_expenses");
  const mktRoiMonth = spendTotal > 0 ? (monthRev - spendTotal) / spendTotal : 0;
  const companyRoiMonth = spendTotal + opexMonth > 0 ? (monthRev - spendTotal - opexMonth) / (spendTotal + opexMonth) : 0;

  // Fallout (YTD) + reasons
  const fallout = closings.filter((c) => c.status === "fell_through" && (c.closeDate ? c.closeDate >= yearStart : true));
  const falloutByReason = fallout.reduce((m, c) => { const r = c.falloutReason || ""; m[r] = (m[r] ?? 0) + 1; return m; }, {} as Record<string, number>);
  // By-market avg fee (YTD closed)
  const byMarket = closedYTD.reduce((m, c) => { const k = c.market || "—"; (m[k] ??= []).push(c.revenue); return m; }, {} as Record<string, number[]>);

  // Closed deals by lead source — ALL-TIME (HUD ledger history + escrow tracker),
  // so the cold-call era shows next to PPL. Track count, total net, biggest, avg.
  const bySource = new Map<string, { count: number; net: number; biggest: number }>();
  const addSrc = (raw: string, net: number) => {
    const k = normSource(raw);
    const a = bySource.get(k) ?? { count: 0, net: 0, biggest: 0 };
    a.count++; a.net += net; a.biggest = Math.max(a.biggest, net);
    bySource.set(k, a);
  };
  for (const d of ledger) addSrc(d.leadSource, d.profit);
  for (const c of closings.filter((c) => c.status === "closed")) addSrc(c.source, netOf(c));
  const sourceRows = [...bySource.entries()].map(([k, a]) => ({ key: k, ...a, avg: a.count ? a.net / a.count : 0 })).sort((x, y) => y.net - x.net);
  const bestByTotal = sourceRows[0]?.key;
  const bestByAvg = [...sourceRows].sort((a, b) => b.avg - a.avg)[0]?.key;

  // Ops snapshot
  const activeBuyers = buyers.filter((b) => b.vetStage === "active").length;
  const vettedBuyers = buyers.filter((b) => b.vetStage === "vetted" || b.vetStage === "active").length;
  const domList = deals.map((d) => (d.contractDate && d.soldDate ? (Date.parse(d.soldDate) - Date.parse(d.contractDate)) / 86400000 : NaN)).filter((d) => Number.isFinite(d) && d >= 0);
  const avgDom = domList.length ? domList.reduce((s, d) => s + d, 0) / domList.length : 0;

  // Current month input values to prefill the form
  const cur = (k: string) => { const v = mo[k]; return v != null && v !== 0 ? v : ""; };

  const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <Card className="p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div><div className="text-lg font-extrabold tabular-nums text-slate-800">{value}</div>{sub && <div className="text-[10px] text-slate-400">{sub}</div>}</Card>
  );

  return (
    <div className="space-y-6">
      <SectionTitle title="📐 Marketing & Financial Benchmarks" subtitle={`Marketing for ${friendlyDate(monthStart).replace(/, \d{4}/, "")} · closings & financials year-to-date (${year})`} accent="bg-indigo-500"
        right={<span className="text-xs text-slate-400">Managers only</span>} />

      {/* Marketing inputs */}
      <Card className="p-5">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">This month&apos;s marketing inputs</p>
        <p className="mb-3 text-xs text-slate-500">Enter spend per channel + email rates so cost-per-lead and ROI calculate. Leads come from the team&apos;s daily logs (PPL / SMS / mail).</p>
        <form action={saveBenchmarkInputs} className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <input type="hidden" name="month" value={month} />
          <label className="text-xs"><span className="mb-0.5 block text-slate-500">PPL spend $</span><input name="spend_ppl" type="number" step="0.01" defaultValue={cur("spend_ppl")} className={inputCls} /></label>
          <label className="text-xs"><span className="mb-0.5 block text-slate-500">SMS spend $</span><input name="spend_sms" type="number" step="0.01" defaultValue={cur("spend_sms")} className={inputCls} /></label>
          <label className="text-xs"><span className="mb-0.5 block text-slate-500">Mail spend $</span><input name="spend_mail" type="number" step="0.01" defaultValue={cur("spend_mail")} className={inputCls} /></label>
          <label className="text-xs"><span className="mb-0.5 block text-slate-500">Email open %</span><input name="email_open_rate" type="number" step="0.1" defaultValue={cur("email_open_rate")} className={inputCls} /></label>
          <label className="text-xs"><span className="mb-0.5 block text-slate-500">Email CTR %</span><input name="email_ctr" type="number" step="0.1" defaultValue={cur("email_ctr")} className={inputCls} /></label>
          <div className="flex items-end"><button className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Save</button></div>
        </form>
      </Card>

      {/* Marketing — this month */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">📣 Marketing — this month</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Leads" value={String(Math.round(leadsTotal))} sub={`PPL ${leadsByCh.ppl} · SMS ${leadsByCh.sms} · Mail ${leadsByCh.mail}`} />
          {cSuite && <Stat label="Spend" value={usd(spendTotal)} sub={`PPL ${usd(spendByCh.ppl)} · SMS ${usd(spendByCh.sms)} · Mail ${usd(spendByCh.mail)}`} />}
          {cSuite && <Stat label="Cost / lead" value={leadsTotal ? usd(cpl(spendTotal, leadsTotal)) : "—"} sub={`PPL ${leadsByCh.ppl ? usd(cpl(spendByCh.ppl, leadsByCh.ppl)) : "—"} · SMS ${leadsByCh.sms ? usd(cpl(spendByCh.sms, leadsByCh.sms)) : "—"} · Mail ${leadsByCh.mail ? usd(cpl(spendByCh.mail, leadsByCh.mail)) : "—"}`} />}
          {cSuite && <Stat label="Cost / contracted deal" value={contractsMonth ? usd(costPerContract) : "—"} sub={`${Math.round(contractsMonth)} signed this month`} />}
          <Stat label="Lead → contract" value={leadsTotal ? pct(contractsMonth / leadsTotal) : "—"} />
          {cSuite && <Stat label="Marketing ROI (mo)" value={spendTotal ? `${mktRoiMonth.toFixed(1)}×` : "—"} sub={`rev ${usd(monthRev)} vs spend ${usd(spendTotal)}`} />}
          <Stat label="Email open" value={mv("email_open_rate") ? `${mv("email_open_rate")}%` : "—"} />
          <Stat label="Email CTR" value={mv("email_ctr") ? `${mv("email_ctr")}%` : "—"} />
        </div>
      </section>

      {/* Closings & financials — YTD */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">💰 Closings &amp; financials — {year} YTD</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Deals closed" value={String(closedCount)} />
          <Stat label="Gross revenue" value={usd(grossRev)} />
          {cSuite && <Stat label="Net profit" value={usd(netProfit)} sub="after all expenses & closing costs" />}
          {cSuite && <Stat label="Net profit / deal" value={closedCount ? usd(netPerDeal) : "—"} />}
          <Stat label="Avg assignment fee" value={assignments.length ? usd(avgAssignFee) : "—"} sub={`${assignments.length} assignments`} />
          <Stat label="Contract → close" value={contractsYear ? pct(contractToClose) : "—"} sub={`${Math.round(contractsYear)} signed YTD`} />
          <Stat label="Avg days to close" value={dayDiffs.length ? `${Math.round(avgEscrowDays)} days` : "—"} sub="escrow open → close" />
          {cSuite && <Stat label="Company ROI (mo)" value={spendTotal + opexMonth ? `${(companyRoiMonth * 100).toFixed(0)}%` : "—"} sub="after mktg + opex" />}
        </div>
      </section>

      {/* Closed deals by lead source — all-time (which channel produces best) */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">🎯 Closed deals by lead source <span className="font-normal text-slate-400">— all-time (ledger + escrow)</span></h2>
        {sourceRows.length === 0 ? (
          <Card className="p-4 text-sm text-slate-400">No closed deals with a source yet. Tag each deal&apos;s source in <Link href="/closing" className="underline">Escrow &amp; Closing</Link> (and the historical ledger in Closed deals) to compare channels.</Card>
        ) : (
          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="py-1.5 pr-3">Source</th>
                    <th className="px-2 text-right">Deals</th>
                    <th className="px-2 text-right">Total net profit</th>
                    <th className="px-2 text-right">Avg / deal</th>
                    <th className="px-2 text-right">Biggest</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceRows.map((r) => (
                    <tr key={r.key} className="border-b border-slate-50">
                      <td className="py-1.5 pr-3 font-semibold text-slate-700">
                        {SRC_LABEL[r.key] ?? r.key}
                        {r.key === bestByTotal && <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">most profit</span>}
                        {r.key === bestByAvg && r.key !== bestByTotal && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">biggest deals</span>}
                      </td>
                      <td className="px-2 text-right tabular-nums">{r.count}</td>
                      <td className="px-2 text-right font-semibold tabular-nums text-emerald-700">{usd(r.net)}</td>
                      <td className="px-2 text-right tabular-nums">{usd(r.avg)}</td>
                      <td className="px-2 text-right tabular-nums text-slate-500">{usd(r.biggest)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">“Most profit” = biggest total contribution (volume). “Biggest deals” = highest average per deal (quality). PPL tends to win on volume; cold call often wins on deal size.</p>
          </Card>
        )}
      </section>

      {/* Avg fee by market */}
      {Object.keys(byMarket).length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Avg assignment fee by market (closed YTD)</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byMarket).map(([mk, fees]) => (
              <span key={mk} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{mk}: <span className="tabular-nums text-slate-800">{usd(fees.reduce((s, f) => s + f, 0) / fees.length)}</span> <span className="text-slate-400">({fees.length})</span></span>
            ))}
          </div>
        </Card>
      )}

      {/* Ops + fallout */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">🛠 Disposition / ops</p>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Cash buyer list" value={String(vettedBuyers)} sub={`${activeBuyers} active`} />
            <Stat label="Avg days on market" value={domList.length ? `${Math.round(avgDom)} days` : "—"} sub="contract → sold" />
          </div>
          <p className="mt-2 text-[10px] text-slate-400">Cash-buyer list pulls live from Markets &amp; Buyers (vetted + active).</p>
        </Card>
        <Card className="p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">💀 Fallout (YTD): {fallout.length}</p>
          {fallout.length === 0 ? (
            <p className="text-xs text-slate-400">No deals fell through this year. 🎉</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(falloutByReason).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
                <span key={r} className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">{FALLOUT_LABEL[r] ?? r}: {n}</span>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] text-slate-400">Set a deal to “Fell through” + reason in <Link href="/closing" className="underline">Escrow &amp; Closing</Link>.</p>
        </Card>
      </div>
    </div>
  );
}
