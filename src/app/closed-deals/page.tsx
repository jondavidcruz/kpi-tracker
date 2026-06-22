import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { friendlyDate } from "@/lib/date";
import { Card, SectionTitle, MetricCard } from "@/components/ui";
import HubTabs from "@/components/HubTabs";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const TYPE_LABEL: Record<string, string> = {
  assignment: "Assignment",
  jv: "JV",
  wholetail: "Wholetail",
  double_close: "Double close",
  subject_to: "Subject-to",
};
const LEAD_LABEL: Record<string, string> = {
  ppl: "Pay-per-lead",
  cold_call: "Cold call",
  other: "Other",
};

export default async function ClosedDealsPage() {
  const me = await getCurrentUser();
  if (!isAdmin(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Owner only</h1>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }

  const deals = await db.closedDeal.findMany({
    orderBy: { closeDate: "desc" },
    // exclude the HUD blob from the list query — it's streamed on demand
    select: {
      id: true, address: true, city: true, state: true, closeDate: true, year: true,
      dealType: true, profit: true, notes: true, leadSource: true, acquisitionCost: true,
      hudName: true, closedBy: true,
    },
  });
  const total = deals.reduce((s, d) => s + d.profit, 0);
  const avg = deals.length ? total / deals.length : 0;
  const best = deals.reduce((m, d) => (d.profit > m ? d.profit : m), 0);

  const byYear = new Map<number, { count: number; profit: number }>();
  for (const d of deals) {
    const y = byYear.get(d.year) ?? { count: 0, profit: 0 };
    y.count += 1; y.profit += d.profit; byYear.set(d.year, y);
  }
  const years = [...byYear.entries()].sort((a, b) => b[0] - a[0]);

  return (
    <div className="space-y-7">
      <HubTabs tabs={[{ href: "/deals", label: "Active deals" }, { href: "/closing", label: "Escrow & Closing" }, { href: "/closed-deals", label: "Closed deals" }]} />
      <SectionTitle title="💰 Closed Deals" subtitle="Every paid deal, profit verified from the HUD statements. Owner-only." accent="bg-emerald-400" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total profit (all-time)" value={money(total)} hint={`${deals.length} deals`} />
        <MetricCard label="Average / deal" value={money(avg)} />
        <MetricCard label="Biggest deal" value={money(best)} hint="1528 W Virginia (wholetail)" />
        <MetricCard label="Years on record" value={`${years.length}`} hint={years.length ? `${years[years.length - 1][0]}–${years[0][0]}` : ""} />
      </div>

      {/* By year */}
      <section>
        <h3 className="mb-2 text-sm font-bold text-slate-700">By year</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {years.map(([y, v]) => (
            <Card key={y} className="p-4">
              <div className="text-xs font-medium text-slate-500">{y}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{money(v.profit)}</div>
              <div className="text-xs text-slate-400">{v.count} deal{v.count === 1 ? "" : "s"}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* Ledger */}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-left">
              <th className="px-4 py-2.5 font-semibold">Property</th>
              <th className="px-3 py-2.5 font-semibold">Closed</th>
              <th className="px-3 py-2.5 font-semibold">Type</th>
              <th className="px-3 py-2.5 text-right font-semibold">Profit</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => (
              <tr key={d.id} className="border-b border-slate-100 last:border-0 align-top">
                <td className="px-4 py-2.5">
                  <div className="font-semibold text-slate-800">{d.address}</div>
                  <div className="text-xs text-slate-400">{[d.city, d.state].filter(Boolean).join(", ")}</div>
                  {d.notes && <div className="mt-0.5 text-xs text-slate-500">{d.notes}</div>}
                  {/* Lead generation + acquisition cost */}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    {d.leadSource && (
                      <span className={`rounded-md px-1.5 py-0.5 font-semibold ${d.leadSource === "ppl" ? "bg-violet-100 text-violet-700" : d.leadSource === "cold_call" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"}`}>
                        {LEAD_LABEL[d.leadSource] ?? d.leadSource}
                      </span>
                    )}
                    <span className="text-slate-500">
                      Acquire cost: {d.acquisitionCost != null ? <strong className="text-slate-700">{money(d.acquisitionCost)}</strong> : <span className="text-slate-400">TBD</span>}
                    </span>
                    {d.hudName && (
                      <a href={`/closed-deals/hud/${d.id}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-navy hover:underline">📄 View HUD</a>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{friendlyDate(d.closeDate)}</td>
                <td className="px-3 py-2.5"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{TYPE_LABEL[d.dealType] ?? d.dealType}</span></td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-emerald-700">{money(d.profit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50/50">
              <td className="px-4 py-2.5 font-bold text-slate-700" colSpan={3}>Total</td>
              <td className="px-3 py-2.5 text-right font-bold tabular-nums text-emerald-700">{money(total)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>

      <p className="text-center text-xs text-slate-400">
        Profit = net from escrow per each HUD (assignment fee / computed net) — before marketing cost to source the lead, which is tracked separately as an expense. This ledger feeds the Trends page&apos;s deal-profit figures.
      </p>
    </div>
  );
}
