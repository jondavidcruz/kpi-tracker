import Link from "next/link";
import { saveDay } from "@/app/actions";
import EntryForm, { type EntryGroup } from "@/components/EntryForm";
import SpeedTestCard from "@/components/SpeedTestCard";
import {
  getActiveReps,
  getAllTargets,
  getDailyValues,
  getKpis,
  getSettings,
  resolveGoalWith,
} from "@/lib/data";
import { todayStr, friendlyDate, monthOf } from "@/lib/date";
import { toInputNumber, type Unit } from "@/lib/format";
import { positionLabel } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function EntryPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const date = sp.date ?? todayStr(settings.orgTimezone);
  const month = monthOf(date);

  const reps = await getActiveReps();
  const selectedId = sp.user ?? reps[0]?.id;
  const rep = reps.find((r) => r.id === selectedId);

  const [roleKpis, internetKpis, teamDaily, values, targets] = await Promise.all([
    rep
      ? getKpis({ scope: "per_rep", cadence: "daily", computed: false, roleKey: rep.position })
      : Promise.resolve([]),
    // Internet-speed KPI shows for anyone flagged tracksInternet, across roles.
    rep?.tracksInternet
      ? getKpis({ scope: "per_rep", cadence: "daily", computed: false, roleKey: "internet" })
      : Promise.resolve([]),
    getKpis({ scope: "team", cadence: "daily", computed: false }),
    getDailyValues(date),
    getAllTargets(),
  ]);

  // Internet speed gets its own prominent test card (below), not a plain field.
  const internetKpi = internetKpis[0] ?? null;
  const internetGoal = internetKpi && rep ? resolveGoalWith(targets, internetKpi, rep.id, month) : null;
  const internetInitial =
    internetKpi && rep ? values.get(`${internetKpi.id}|${rep.id}`) ?? null : null;

  const groups: EntryGroup[] = [];
  if (rep) {
    const items = roleKpis.map((k) => ({
      kpiId: k.id,
      kpiKey: k.key,
      name: k.name,
      emoji: k.emoji,
      unit: k.unit as Unit,
      goalValue: resolveGoalWith(targets, k, rep.id, month),
      goalKind: k.goalKind,
      userId: rep.id,
      initial: toInputNumber(k.unit as Unit, values.get(`${k.id}|${rep.id}`)),
    }));
    groups.push({
      title: `${rep.name} · ${positionLabel(rep.position)}`,
      hint: "Your activity for the day.",
      items,
    });
  }
  if (teamDaily.length > 0) {
    groups.push({
      title: "Lead sources (shared)",
      hint: "PPL / text / direct-mail leads — entered once for the whole team.",
      items: teamDaily.map((k) => ({
        kpiId: k.id,
        kpiKey: k.key,
        name: k.name,
        emoji: k.emoji,
        unit: k.unit as Unit,
        goalValue: resolveGoalWith(targets, k, null, month),
        goalKind: k.goalKind,
        userId: "",
        initial: toInputNumber(k.unit as Unit, values.get(`${k.id}|`)),
      })),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Enter KPIs</h1>
        <p className="text-slate-500">{friendlyDate(date)}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {reps.map((r) => {
          const active = r.id === selectedId;
          return (
            <Link
              key={r.id}
              href={`/entry?user=${r.id}${sp.date ? `&date=${sp.date}` : ""}`}
              className={`rounded-full px-4 py-2 text-sm font-medium border ${
                active
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              {r.name}
              <span className={`ml-1.5 text-xs ${active ? "text-slate-300" : "text-slate-400"}`}>
                {positionLabel(r.position)}
              </span>
            </Link>
          );
        })}
      </div>

      <form className="flex items-center gap-2 text-sm" action="/entry" method="get">
        {selectedId && <input type="hidden" name="user" value={selectedId} />}
        <label className="text-slate-500">Date</label>
        <input
          type="date"
          name="date"
          defaultValue={date}
          className="rounded-md border border-slate-300 px-3 py-1.5"
        />
        <button className="rounded-md bg-slate-200 px-3 py-1.5 font-medium hover:bg-slate-300">Go</button>
      </form>

      {rep && internetKpi && (
        <SpeedTestCard
          userId={rep.id}
          date={date}
          goal={internetGoal ?? 50}
          initial={internetInitial}
        />
      )}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          No daily KPIs for this role yet. Add some in{" "}
          <Link href="/admin" className="text-slate-900 underline">Admin</Link>.
        </div>
      ) : (
        <EntryForm groups={groups} date={date} enteredBy={rep?.name ?? "team"} action={saveDay} />
      )}
    </div>
  );
}
