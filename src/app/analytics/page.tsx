import { db } from "@/lib/db";
import { getActiveReps, getKpis } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { getSettings } from "@/lib/data";
import { formatValue, type Unit } from "@/lib/format";
import { getCurrentUser, isManager } from "@/lib/auth";
import { POSITIONS } from "@/lib/roles";
import { Card, SectionTitle } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Year-to-date analytics: per-rep YTD totals + monthly trend, across all history.
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }

  const sp = await searchParams;
  const settings = await getSettings();
  const year = sp.year ?? todayStr(settings.orgTimezone).slice(0, 4);

  const [reps, perRep] = await Promise.all([
    getActiveReps(),
    getKpis({ scope: "per_rep", computed: false }),
  ]);

  // All entries for the year.
  const entries = await db.entry.findMany({
    where: { date: { gte: `${year}-01-01`, lte: `${year}-12-31` }, userId: { not: null } },
  });

  // index: `${kpiId}|${userId}` -> { ytd, byMonth[12] }
  const idx = new Map<string, { ytd: number; m: number[] }>();
  for (const e of entries) {
    const key = `${e.kpiId}|${e.userId}`;
    if (!idx.has(key)) idx.set(key, { ytd: 0, m: Array(12).fill(0) });
    const rec = idx.get(key)!;
    rec.ytd += e.value;
    const mi = Number(e.date.slice(5, 7)) - 1;
    if (mi >= 0 && mi < 12) rec.m[mi] += e.value;
  }

  const dataMonths = new Set(entries.map((e) => Number(e.date.slice(5, 7)) - 1));
  const activeMonths = MONTHS.map((m, i) => ({ m, i })).filter((x) => dataMonths.has(x.i));

  return (
    <div className="space-y-7">
      <SectionTitle
        title={`📈 Year Analytics: ${year}`}
        subtitle="Year-to-date totals and monthly trend per rep · includes imported history"
        accent="bg-brand-gold"
      />

      {entries.length === 0 ? (
        <Card className="p-10 text-center text-slate-400">No data for {year} yet.</Card>
      ) : (
        POSITIONS.map((pos) => {
          const roleReps = reps.filter((r) => r.position === pos.key);
          const roleKpis = perRep.filter((k) => k.roleKey === pos.key);
          if (roleReps.length === 0) return null;
          return (
            <section key={pos.key}>
              <h2 className="mb-2 text-lg font-bold text-slate-800">{pos.emoji} {pos.label}</h2>
              <div className="space-y-4">
                {roleReps.map((rep) => {
                  // KPIs this rep has any data for
                  const rows = roleKpis
                    .map((k) => ({ k, rec: idx.get(`${k.id}|${rep.id}`) }))
                    .filter((x) => x.rec && x.rec.ytd > 0);
                  if (rows.length === 0) return null;
                  return (
                    <Card key={rep.id} className="overflow-x-auto p-0">
                      <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 font-bold text-slate-800">
                        {rep.name}
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-slate-500">
                            <th className="px-4 py-2 font-semibold">KPI</th>
                            <th className="px-3 py-2 text-right font-semibold">YTD</th>
                            {activeMonths.map((m) => (
                              <th key={m.i} className="px-3 py-2 text-right font-semibold">{m.m}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(({ k, rec }) => (
                            <tr key={k.id} className="border-t border-slate-100">
                              <td className="px-4 py-2 font-medium text-slate-700">{k.emoji} {k.name}</td>
                              <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900">{formatValue(k.unit as Unit, rec!.ytd)}</td>
                              {activeMonths.map((m) => (
                                <td key={m.i} className="px-3 py-2 text-right tabular-nums text-slate-500">
                                  {rec!.m[m.i] ? formatValue(k.unit as Unit, rec!.m[m.i]) : "·"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      <p className="text-center text-xs text-slate-400">
        Totals include historical data imported from the original scorecard (attributed to whoever did the work).
      </p>
    </div>
  );
}
