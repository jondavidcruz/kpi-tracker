import Link from "next/link";
import { db } from "@/lib/db";
import { getAllTargets, resolveGoalWith } from "@/lib/data";
import { friendlyDate } from "@/lib/date";
import { formatValue, type Unit } from "@/lib/format";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { positionLabel } from "@/lib/roles";
import { Card } from "@/components/ui";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

// A printable, all-time KPI record for one rep — the "save a copy before they
// leave the team" report. Pulls by the rep's actual entries (not by current
// role), so it stays correct even after the rep is archived or the role retired.
export default async function RepExportPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Private</h1>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }

  const { id } = await params;
  const rep = await db.user.findUnique({ where: { id } });
  if (!rep) return <Card className="p-8 text-center text-slate-500">Rep not found.</Card>;

  const [entries, kpis, targets] = await Promise.all([
    db.entry.findMany({ where: { userId: rep.id }, orderBy: { date: "asc" } }),
    db.kpi.findMany(), // include inactive, so retired-role KPIs still resolve
    getAllTargets(),
  ]);
  const kpiById = new Map(kpis.map((k) => [k.id, k]));

  // Overall span + active days.
  const allDates = entries.map((e) => e.date).sort();
  const firstDate = allDates[0] ?? null;
  const lastDate = allDates[allDates.length - 1] ?? null;
  const totalActiveDays = new Set(allDates).size;
  const latestMonth = (lastDate ?? "").slice(0, 7);

  // Per-KPI all-time rollup (only KPIs the rep actually logged).
  type Row = { kpiId: string; name: string; emoji: string; unit: Unit; total: number; days: number; avg: number; goal: number | null; first: string; last: string; sort: number };
  const byKpi = new Map<string, { total: number; days: Set<string>; first: string; last: string }>();
  for (const e of entries) {
    const cur = byKpi.get(e.kpiId) ?? { total: 0, days: new Set<string>(), first: e.date, last: e.date };
    cur.total += e.value;
    cur.days.add(e.date);
    if (e.date < cur.first) cur.first = e.date;
    if (e.date > cur.last) cur.last = e.date;
    byKpi.set(e.kpiId, cur);
  }
  const rows: Row[] = [...byKpi.entries()].map(([kpiId, v]) => {
    const k = kpiById.get(kpiId);
    return {
      kpiId,
      name: k?.name ?? "(removed KPI)",
      emoji: k?.emoji ?? "•",
      unit: (k?.unit as Unit) ?? "count",
      total: v.total,
      days: v.days.size,
      avg: v.days.size ? v.total / v.days.size : 0,
      goal: k ? resolveGoalWith(targets, k, rep.id, latestMonth) : null,
      first: v.first,
      last: v.last,
      sort: k?.sortOrder ?? 999,
    };
  }).sort((a, b) => a.sort - b.sort);

  // Monthly activity (distinct days logged per month).
  const byMonth = new Map<string, Set<string>>();
  for (const e of entries) {
    const m = e.date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, new Set());
    byMonth.get(m)!.add(e.date);
  }
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div id="rep-report" className="mx-auto max-w-3xl space-y-6 bg-white p-2">
      <style>{`@media print {
        .no-print { display: none !important; }
        body * { visibility: hidden; }
        #rep-report, #rep-report * { visibility: visible; }
        #rep-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
        @page { margin: 16mm; }
      }`}</style>

      <div className="no-print flex items-center justify-between">
        <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-800">← Back to Admin</Link>
        <PrintButton />
      </div>

      {/* Report header */}
      <div className="border-b-2 border-brand-navy pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-brand-navy">KPI Record — {rep.name}</h1>
            <p className="text-sm text-slate-500">{positionLabel(rep.position)}{rep.note ? ` · ${rep.note}` : ""}</p>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>Freedom Offers</div>
            <div>Record through {lastDate ? friendlyDate(lastDate) : "—"}</div>
          </div>
        </div>
      </div>

      {/* Summary line */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg ring-1 ring-slate-200 p-3">
          <div className="text-xs font-semibold text-slate-500">DAYS ACTIVE</div>
          <div className="text-2xl font-extrabold text-slate-800">{totalActiveDays}</div>
        </div>
        <div className="rounded-lg ring-1 ring-slate-200 p-3">
          <div className="text-xs font-semibold text-slate-500">FIRST LOGGED</div>
          <div className="text-sm font-bold text-slate-800">{firstDate ? friendlyDate(firstDate) : "—"}</div>
        </div>
        <div className="rounded-lg ring-1 ring-slate-200 p-3">
          <div className="text-xs font-semibold text-slate-500">LAST LOGGED</div>
          <div className="text-sm font-bold text-slate-800">{lastDate ? friendlyDate(lastDate) : "—"}</div>
        </div>
      </div>

      {entries.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">No KPI entries on record for {rep.name}.</Card>
      ) : (
        <>
          {/* All-time per-KPI table */}
          <div>
            <h2 className="mb-2 text-sm font-bold text-slate-700">All-time KPI totals</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 text-left">
                  <th className="py-2 pr-2 font-semibold">KPI</th>
                  <th className="py-2 px-2 text-right font-semibold">Total</th>
                  <th className="py-2 px-2 text-right font-semibold">Avg / logged day</th>
                  <th className="py-2 px-2 text-right font-semibold">Goal</th>
                  <th className="py-2 px-2 text-center font-semibold">Days</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.kpiId} className="border-b border-slate-150">
                    <td className="py-1.5 pr-2 font-medium text-slate-700">{r.emoji} {r.name}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{formatValue(r.unit, r.total)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{formatValue(r.unit, r.avg)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-slate-500">{r.goal === null ? "—" : formatValue(r.unit, r.goal)}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums">{r.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Monthly activity */}
          <div>
            <h2 className="mb-2 mt-2 text-sm font-bold text-slate-700">Activity by month</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 text-left">
                  <th className="py-2 pr-2 font-semibold">Month</th>
                  <th className="py-2 px-2 text-right font-semibold">Days logged</th>
                </tr>
              </thead>
              <tbody>
                {months.map(([m, days]) => (
                  <tr key={m} className="border-b border-slate-150">
                    <td className="py-1.5 pr-2 text-slate-700">{m}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{days.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-center text-xs text-slate-400">
        Generated from the Freedom Offers KPI Tracker · {entries.length} total entries on record.
      </p>
    </div>
  );
}
