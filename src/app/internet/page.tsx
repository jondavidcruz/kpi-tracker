import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getActiveReps, getAllTargets, getSettings, resolveGoalWith } from "@/lib/data";
import { todayStr, monthOf, monthBounds, currentWeekRange, datesInRange } from "@/lib/date";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function tone(v: number | null, goal: number) {
  if (v === null) return "text-slate-300";
  return v >= goal ? "text-emerald-600" : v >= 25 ? "text-amber-600" : "text-red-600";
}
function cellBg(v: number | null, goal: number) {
  if (v === null) return "bg-slate-50 text-slate-300";
  return v >= goal ? "bg-emerald-50 text-emerald-700" : v >= 25 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
}

export default async function InternetPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <p className="mt-1 text-sm text-slate-500">The team internet view is visible to Jon &amp; Marie.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const sp = await searchParams;
  const settings = await getSettings();
  const today = sp.date ?? todayStr(settings.orgTimezone);
  const month = monthOf(today);

  const kpi = await db.kpi.findFirst({ where: { roleKey: "internet" }, select: { id: true, goalValue: true } });
  const allReps = await getActiveReps();
  const reps = allReps.filter((r) => r.tracksInternet);
  const targets = await getAllTargets();

  const mb = monthBounds(today);
  const entries = kpi
    ? await db.entry.findMany({
        where: { kpiId: kpi.id, date: { gte: mb.start, lte: today } },
        select: { userId: true, date: true, value: true },
      })
    : [];
  const valAt = new Map<string, number>();
  for (const e of entries) if (e.userId) valAt.set(`${e.userId}|${e.date}`, e.value);

  const week = currentWeekRange(today);
  const weekDays = datesInRange(week.start, week.end)
    .filter((d) => {
      const dow = new Date(d + "T12:00:00Z").getUTCDay();
      return dow >= 1 && dow <= 5; // Mon–Fri (team is off weekends)
    })
    .map((d) => ({ date: d, dow: new Date(d + "T12:00:00Z").getUTCDay() }));
  const monthDays = datesInRange(mb.start, today);

  const goalFor = (repId: string) => (kpi ? resolveGoalWith(targets, kpi, repId, month) : null) ?? 50;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="📡 Internet Speed"
        subtitle="Each rep's daily speed-test reading — today, this week, and this month. Goal 50+ Mbps for a smooth dialer, calls & CRM."
        accent="bg-indigo-400"
        right={<span className="text-sm font-semibold text-slate-500">{week.label}</span>}
      />

      {!kpi || reps.length === 0 ? (
        <Card className="p-10 text-center text-slate-400">No internet-speed tracking set up yet.</Card>
      ) : (
        <>
          {/* TODAY */}
          <section>
            <h3 className="mb-2 text-sm font-bold text-slate-700">Today</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {reps.map((rep) => {
                const goal = goalFor(rep.id);
                const v = valAt.get(`${rep.id}|${today}`) ?? null;
                return (
                  <Card key={rep.id} className="p-4">
                    <div className="truncate text-xs font-medium text-slate-500">{rep.name}</div>
                    <div className={`mt-1 text-3xl font-extrabold tabular-nums ${tone(v, goal)}`}>
                      {v === null ? "—" : v}
                      <span className="text-sm font-semibold text-slate-400"> Mbps</span>
                    </div>
                    <div className={`text-xs font-semibold ${tone(v, goal)}`}>
                      {v === null ? "not tested yet" : v >= goal ? "✓ good to work" : v >= 25 ? "⚠️ below goal" : "🔴 too slow"}
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* THIS WEEK */}
          <section>
            <h3 className="mb-2 text-sm font-bold text-slate-700">This week (Mon–Fri)</h3>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-left">
                    <th className="sticky left-0 bg-slate-50/70 px-4 py-2.5 font-semibold">Rep</th>
                    {weekDays.map((d) => (
                      <th key={d.date} className="px-3 py-2.5 text-center font-semibold">
                        {WD[d.dow]} <span className="text-slate-400">{d.date.slice(8)}</span>
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-center font-semibold">Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {reps.map((rep) => {
                    const goal = goalFor(rep.id);
                    const vals = weekDays.map((d) => valAt.get(`${rep.id}|${d.date}`) ?? null);
                    const recorded = vals.filter((v): v is number => v !== null);
                    const avg = recorded.length ? Math.round(recorded.reduce((a, b) => a + b, 0) / recorded.length) : null;
                    return (
                      <tr key={rep.id} className="border-b border-slate-100 last:border-0">
                        <td className="sticky left-0 bg-white px-4 py-2 font-semibold text-slate-800">{rep.name}</td>
                        {vals.map((v, i) => (
                          <td key={i} className="px-2 py-2 text-center">
                            <span className={`inline-block min-w-14 rounded-lg px-2 py-1 font-bold tabular-nums ${cellBg(v, goal)}`}>
                              {v === null ? "—" : v}
                            </span>
                          </td>
                        ))}
                        <td className={`px-3 py-2 text-center font-bold tabular-nums ${tone(avg, goal)}`}>{avg ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </section>

          {/* THIS MONTH */}
          <section>
            <h3 className="mb-2 text-sm font-bold text-slate-700">This month ({month})</h3>
            <Card className="divide-y divide-slate-100">
              {reps.map((rep) => {
                const goal = goalFor(rep.id);
                const series = monthDays.map((d) => ({ date: d, v: valAt.get(`${rep.id}|${d}`) ?? null }));
                const recorded = series.filter((s): s is { date: string; v: number } => s.v !== null);
                const avg = recorded.length ? Math.round(recorded.reduce((a, b) => a + b.v, 0) / recorded.length) : null;
                const min = recorded.length ? Math.min(...recorded.map((s) => s.v)) : null;
                const lowDays = recorded.filter((s) => s.v < goal).length;
                const scaleMax = Math.max(goal, ...recorded.map((s) => s.v), 1);
                return (
                  <div key={rep.id} className="flex flex-wrap items-center gap-4 p-4">
                    <div className="w-32 shrink-0 font-semibold text-slate-800">{rep.name}</div>
                    <div className="flex flex-1 items-end gap-0.5" style={{ height: 44, minWidth: 160 }}>
                      {series.map((s) => {
                        const h = s.v === null ? 3 : Math.max(3, Math.round((s.v / scaleMax) * 42));
                        const c = s.v === null ? "bg-slate-200" : s.v >= goal ? "bg-emerald-400" : s.v >= 25 ? "bg-amber-400" : "bg-red-400";
                        return <div key={s.date} title={`${s.date}: ${s.v === null ? "no test" : `${s.v} Mbps`}`} className={`flex-1 rounded-sm ${c}`} style={{ height: h }} />;
                      })}
                    </div>
                    <div className="w-48 shrink-0 text-right text-xs text-slate-500">
                      <div>avg <span className="font-semibold tabular-nums text-slate-700">{avg ?? "—"}</span> · low <span className="font-semibold tabular-nums text-slate-700">{min ?? "—"}</span> Mbps · {recorded.length} tested</div>
                      <div>goal {goal}+ · <span className={lowDays >= 3 ? "font-semibold text-red-600" : "text-slate-400"}>{lowDays} day{lowDays === 1 ? "" : "s"} below</span></div>
                    </div>
                  </div>
                );
              })}
            </Card>
            <p className="mt-1 text-xs text-slate-400">
              Recorded from the in-app speed test on <Link href="/entry" className="underline hover:text-slate-600">Enter KPIs</Link>. Bars are each day of {month} (left → today). Hover a bar for that day&apos;s reading.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
