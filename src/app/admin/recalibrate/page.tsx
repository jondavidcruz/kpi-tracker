import Link from "next/link";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { computeGoalProposals, type GoalProposal } from "@/lib/recalibrate";
import { positionLabel } from "@/lib/roles";
import { applyGoalRecalibration } from "@/app/actions";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls =
  "w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-center focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";

export default async function RecalibratePage({
  searchParams,
}: {
  searchParams: Promise<{ applied?: string }>;
}) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!isOwner(me)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Owner only</h1>
        <p className="mt-2 text-sm text-slate-500">Goal recalibration is limited to the owner.</p>
      </div>
    );
  }

  const proposals = await computeGoalProposals(28);

  // Group by rep, preserving the order computeGoalProposals returns (rep sort order).
  const byRep = new Map<string, { name: string; role: string; rows: GoalProposal[] }>();
  for (const p of proposals) {
    const g = byRep.get(p.userId) ?? { name: p.userName, role: p.roleKey, rows: [] };
    g.rows.push(p);
    byRep.set(p.userId, g);
  }

  const changedCount = proposals.filter((p) => p.proposed !== Math.round(p.currentGoal)).length;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">🎯 Recalibrate Goals</h1>
          <p className="mt-1 text-sm text-slate-500">
            Realistic daily goals from each rep&apos;s actual last-28-day performance. Review, tweak, then apply.
          </p>
        </div>
        <Link href="/admin" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
          ← Admin
        </Link>
      </div>

      {sp.applied !== undefined && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          ✅ Applied {sp.applied} goal change{sp.applied === "1" ? "" : "s"}. New goals are live on the scorecard.
        </div>
      )}

      <Card className="p-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <strong>How the suggested goal is set:</strong> it&apos;s the <em>median</em> of what the rep actually logged
          over the last 28 days — a number they already hit about half their days, so &ldquo;met&rdquo; becomes achievable
          instead of a permanent miss. <strong>Good day</strong> shows their 75th-percentile (a natural stretch). Blank a
          box to leave that goal unchanged.
        </p>
      </Card>

      {proposals.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          Not enough recent data to propose goals yet. Once reps have logged a couple of weeks of entries, come back.
        </Card>
      ) : (
        <form action={applyGoalRecalibration} className="space-y-5">
          {[...byRep.values()].map((rep) => (
            <Card key={rep.name} className="overflow-hidden p-0">
              <div className="flex items-baseline justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                <strong className="text-slate-900 dark:text-slate-100">{rep.name}</strong>
                <span className="text-xs text-slate-500">{positionLabel(rep.role)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-2 font-semibold">KPI</th>
                      <th className="px-3 py-2 text-center font-semibold">Current</th>
                      <th className="px-3 py-2 text-center font-semibold">Typical</th>
                      <th className="px-3 py-2 text-center font-semibold">Good day</th>
                      <th className="px-3 py-2 text-center font-semibold">Days</th>
                      <th className="px-4 py-2 text-center font-semibold">New goal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rep.rows.map((p) => {
                      const lower = p.proposed < Math.round(p.currentGoal);
                      return (
                        <tr key={p.kpiId} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-4 py-2 text-slate-700 dark:text-slate-200">
                            {p.emoji} {p.kpiName}
                          </td>
                          <td className="px-3 py-2 text-center text-slate-500 tabular-nums">{p.currentGoal}</td>
                          <td className="px-3 py-2 text-center text-slate-500 tabular-nums">{p.median}</td>
                          <td className="px-3 py-2 text-center text-slate-500 tabular-nums">{p.best}</td>
                          <td className="px-3 py-2 text-center text-slate-400 tabular-nums">{p.daysLogged}</td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              name={`goal:${p.userId}:${p.kpiId}`}
                              defaultValue={p.proposed}
                              className={inputCls}
                            />
                            {lower && <span className="ml-1 text-xs text-emerald-600">↓</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Apply new goals
            </button>
            <span className="text-xs text-slate-500">
              {changedCount} of {proposals.length} suggestions differ from the current goal.
            </span>
          </div>
        </form>
      )}
    </div>
  );
}
