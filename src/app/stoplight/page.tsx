import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { reportWeek, kpiPace, getWeekReports, getBoard, LIGHT_META, type Light } from "@/lib/stoplight";
import { Card, SectionTitle } from "@/components/ui";
import StoplightForm from "@/components/StoplightForm";

export const dynamic = "force-dynamic";

const DOT: Record<Light, string> = { green: "bg-emerald-500", yellow: "bg-amber-400", red: "bg-red-500" };

export default async function StoplightPage({ searchParams }: { searchParams: Promise<{ saved?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!me) return null;
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const week = reportWeek(today);
  const [mine, pace, board] = await Promise.all([
    getWeekReports(week.start).then((m) => m.get(me.id) ?? null),
    kpiPace(me, week.start, today),
    getBoard(week),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">🚦 Stoplight Check</h1>
        <p className="text-sm text-slate-500">Week of {week.label} · due <b>Friday end of day</b> · shown on the Monday meeting deck</p>
      </div>

      <Card className="p-5">
        <SectionTitle title="Your week" subtitle="Can you deliver what you committed to this week, and are you unblocked?" accent="bg-brand-navy" />
        {sp.saved && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">✓ Saved — thanks! You can update it any time before the meeting.</p>}
        <p className="mb-3 text-xs text-slate-500">
          KPI context: {pace.total ? <><b>{pace.onPace} of {pace.total}</b> daily-goal KPIs on pace this week{pace.behind.length ? ` (behind: ${pace.behind.join(", ")})` : ""}.</> : "no daily-goal KPIs tracked for your role."}
          {" "}KPIs are context — you pick the color.
        </p>
        <StoplightForm initial={mine?.color ?? null} note={mine?.note ?? ""} greenWhy={mine?.greenWhy ?? ""} behind={pace.behind} err={sp.err} />
      </Card>

      <Card className="p-5">
        <SectionTitle title="Team board" subtitle={`${board.reported} of ${board.expected} reported`} accent="bg-slate-300"
          right={<span className="text-sm">🟢 {board.counts.green} · 🟡 {board.counts.yellow} · 🔴 {board.counts.red}</span>} />
        <div className="space-y-4">
          {board.groups.map((g) => (
            <div key={g.dept}>
              <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">{g.emoji} {g.dept}</div>
              <div className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                {g.people.map((p) => (
                  <div key={p.name} className="flex items-start gap-3 px-3 py-2">
                    <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${p.color ? DOT[p.color] : "bg-slate-200"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800">{p.name} <span className="font-normal text-slate-400">{p.color ? LIGHT_META[p.color].label : "not reported yet"}</span></div>
                      {p.note && <div className="text-xs text-slate-500">{p.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
