import {
  getActiveReps,
  getKpis,
  getRangeSums,
  getOpenDeals,
  getDealMetrics,
  getSettings,
} from "@/lib/data";
import { todayStr, lastWeekRange, currentWeekRange } from "@/lib/date";
import { formatValue, type Unit } from "@/lib/format";
import { POSITIONS } from "@/lib/roles";
import { analyzeDeal, agingClasses } from "@/lib/deals";
import { KpiLabel } from "@/lib/kpiIcons";
import { Card, SectionTitle } from "@/components/ui";
import type { Kpi, User } from "@prisma/client";

export const dynamic = "force-dynamic";

const DEAL_STATUS = {
  under_contract: { label: "Under Contract", cls: "bg-sky-100 text-sky-800" },
  marketing: { label: "Marketing", cls: "bg-amber-100 text-amber-800" },
  buyer_found: { label: "Buyer Found", cls: "bg-violet-100 text-violet-800" },
} as Record<string, { label: string; cls: string }>;

function money(n: number | null): string {
  return n === null || n === undefined ? "—" : `$${n.toLocaleString()}`;
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const today = sp.date ?? todayStr(settings.orgTimezone);
  // Default to THIS week so today's entered KPIs show; ?week=last for review.
  const showLast = sp.week === "last";
  const wk = showLast ? lastWeekRange(today) : currentWeekRange(today);

  const year = today.slice(0, 4);
  const [reps, perRepKpis, teamKpis, sums, deals, dealMetrics] = await Promise.all([
    getActiveReps(),
    getKpis({ scope: "per_rep", computed: false }),
    getKpis({ scope: "team", computed: false, cadence: "daily" }),
    getRangeSums(wk.start, wk.end),
    getOpenDeals(),
    getDealMetrics(year),
  ]);
  const goalRemaining = Math.max(0, (settings.annualRevenueGoal ?? 0) - dealMetrics.revenueClosed);

  // ---- Page 4 data: KPIs at a glance (team totals for the week) ----
  // Sum each team daily KPI + roll up the key per-rep money KPIs across all reps.
  const glance: { key: string; emoji: string; name: string; value: string }[] = [];
  for (const k of teamKpis) {
    glance.push({
      key: k.key,
      emoji: k.emoji,
      name: k.name,
      value: formatValue(k.unit as Unit, sums.get(`${k.id}|`) ?? 0),
    });
  }
  // Roll up notable per-rep green KPIs to a team number.
  const rollupKeys = ["appts_set", "appts_taken", "offers_made", "deals_sold", "new_buyers"];
  for (const k of perRepKpis.filter((x) => rollupKeys.includes(x.key) && x.category === "green")) {
    let total = 0;
    for (const r of reps) total += sums.get(`${k.id}|${r.id}`) ?? 0;
    glance.push({ key: k.key, emoji: k.emoji, name: k.name, value: formatValue(k.unit as Unit, total) });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Weekly Report</h1>
          <p className="text-slate-500">{showLast ? "Last week" : "This week"} · {wk.label}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-200">
            <a href="/report" className={`px-3 py-1.5 text-xs font-semibold ${!showLast ? "bg-brand-navy text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>This week</a>
            <a href="/report?week=last" className={`px-3 py-1.5 text-xs font-semibold ${showLast ? "bg-brand-navy text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>Last week</a>
          </div>
          <span className="rounded-full bg-brand-navy px-3 py-1 text-xs font-semibold text-white">Freedom Offers</span>
        </div>
      </div>

      {/* ===== Revenue / escrow band (page 4 money metrics) ===== */}
      <section>
        <SectionTitle title="Revenue Pipeline" subtitle={`${year} year-to-date · from the Deals board`} accent="bg-emerald-400" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <RevCard label="Revenue Closed" value={money(dealMetrics.revenueClosed)} tone="emerald" />
          <RevCard label="Pending in Escrow" value={money(dealMetrics.revenuePendingEscrow)} />
          <RevCard label="In Escrow" value={String(dealMetrics.inEscrowCount)} />
          <RevCard label="Closed Deals" value={String(dealMetrics.closedCount)} />
          <RevCard label="Goal Remaining" value={settings.annualRevenueGoal ? money(goalRemaining) : "—"} />
        </div>
      </section>

      {/* ===== PAGE 4: KPIs at a glance ===== */}
      <section>
        <SectionTitle title="① KPIs at a Glance" subtitle={`Team totals for ${wk.label}`} accent="bg-brand-gold" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {glance.map((g, i) => (
            <Card key={i} className="p-4">
              <div className="text-xs font-medium text-slate-500"><KpiLabel kpiKey={g.key} name={g.name} /></div>
              <div className="mt-1 text-3xl font-extrabold tabular-nums text-slate-800">{g.value}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* ===== PAGE 5: Full team KPIs by role ===== */}
      <section>
        <SectionTitle title="② Team KPIs" subtitle="Every rep's weekly totals by role" accent="bg-sky-400" />
        <div className="space-y-5">
          {POSITIONS.map((pos) => {
            const roleReps = reps.filter((r) => r.position === pos.key);
            const roleKpis = perRepKpis.filter((k) => k.roleKey === pos.key);
            if (roleReps.length === 0) return null;
            return (
              <RoleWeekTable
                key={pos.key}
                title={`${pos.emoji} ${pos.label}`}
                reps={roleReps}
                kpis={roleKpis}
                sums={sums}
              />
            );
          })}
        </div>
      </section>

      {/* ===== PAGE 6: Active deals being pushed ===== */}
      <section>
        <SectionTitle
          title="③ Active Deals"
          subtitle="Being pushed to sell"
          accent="bg-violet-400"
          right={<span className="text-sm font-semibold text-slate-500">{deals.length} active</span>}
        />
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-left">
                <th className="px-4 py-3 font-semibold">Property</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Rep</th>
                <th className="px-3 py-3 font-semibold">Rep</th>
                <th className="px-3 py-3 text-center font-semibold">Days</th>
                <th className="px-3 py-3 text-right font-semibold">Contract</th>
                <th className="px-3 py-3 text-right font-semibold">Est. profit</th>
                <th className="px-3 py-3 font-semibold">Next steps / action</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => {
                const st = DEAL_STATUS[d.status] ?? { label: d.status, cls: "bg-slate-100 text-slate-700" };
                const aging = analyzeDeal(d, today);
                return (
                  <tr key={d.id} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="px-4 py-3 font-semibold text-slate-800">{d.address}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{d.assignedTo || "—"}</td>
                    <td className="px-3 py-3 text-center">
                      {aging.days === null ? <span className="text-slate-400">—</span> : (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${agingClasses(aging.level)}`}>{aging.days}d</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(d.contractPrice)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(d.assignmentFee)}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 max-w-xs">
                      {d.nextSteps || (aging.level !== "fresh" ? <span className="text-amber-700">{aging.recommendation}</span> : "—")}
                    </td>
                  </tr>
                );
              })}
              {deals.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No active deals right now.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <p className="text-center text-xs text-slate-400">
        Live report · always current · pull into the Canva deck for the Monday 1:30 PT meeting.
      </p>
    </div>
  );
}

function RevCard({ label, value, tone }: { label: string; value: string; tone?: "emerald" }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold tabular-nums ${tone === "emerald" ? "text-emerald-600" : "text-slate-800"}`}>
        {value}
      </div>
    </Card>
  );
}

function RoleWeekTable({
  title,
  reps,
  kpis,
  sums,
}: {
  title: string;
  reps: User[];
  kpis: Kpi[];
  sums: Map<string, number>;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-slate-600">{title}</h3>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70">
              <th className="sticky left-0 bg-slate-50/70 px-4 py-2.5 text-left font-semibold">Rep</th>
              {kpis.map((k) => (
                <th key={k.id} className="whitespace-nowrap px-3 py-2.5 text-center font-semibold">
                  <KpiLabel kpiKey={k.key} name={k.name} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reps.map((rep) => (
              <tr key={rep.id} className="border-b border-slate-100 last:border-0">
                <td className="sticky left-0 bg-white px-4 py-2.5 font-semibold text-slate-800">{rep.name}</td>
                {kpis.map((k) => (
                  <td key={k.id} className="px-3 py-2.5 text-center tabular-nums text-slate-700">
                    {formatValue(k.unit as Unit, sums.get(`${k.id}|${rep.id}`) ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
