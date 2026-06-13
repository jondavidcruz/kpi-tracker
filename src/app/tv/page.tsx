import {
  getActiveReps,
  getAllTargets,
  getDailyValues,
  getKpis,
  getMonthToDateSums,
  getSettings,
  resolveGoalWith,
} from "@/lib/data";
import { todayStr, friendlyDate, paceFraction, monthOf } from "@/lib/date";
import { formatValue, type Unit } from "@/lib/format";
import { statusVsGoal, statusVsPace, type Status } from "@/lib/kpi";
import { POSITIONS } from "@/lib/roles";
import { computeStreaks } from "@/lib/streaks";
import { db } from "@/lib/db";
import type { Kpi, Target, User } from "@prisma/client";

export const dynamic = "force-dynamic";

// Performance color on the dark wall background.
function tone(s: Status): string {
  return s === "hit"
    ? "text-emerald-400"
    : s === "close"
      ? "text-amber-300"
      : s === "miss"
        ? "text-rose-400"
        : "text-slate-500";
}
function chipBg(s: Status): string {
  return s === "hit"
    ? "bg-emerald-500/15 ring-emerald-500/30"
    : s === "close"
      ? "bg-amber-400/15 ring-amber-400/30"
      : s === "miss"
        ? "bg-rose-500/15 ring-rose-500/30"
        : "bg-white/5 ring-white/10";
}

export default async function TvPage() {
  const settings = await getSettings();
  const date = todayStr(settings.orgTimezone);
  const month = monthOf(date);
  const fraction = paceFraction(date);

  const [reps, perRep, teamMonthly, dailyValues, mtdSums, targets, openAlerts, streaks] =
    await Promise.all([
      getActiveReps(),
      getKpis({ scope: "per_rep", computed: false }),
      getKpis({ scope: "team", cadence: "monthly", computed: false }),
      getDailyValues(date),
      getMonthToDateSums(date),
      getAllTargets(),
      db.alert.count({ where: { status: "open" } }),
      computeStreaks(date),
    ]);

  // Team pulse: count goal-bearing per-rep entries on/behind goal today.
  let onGoal = 0;
  let behind = 0;
  for (const pos of POSITIONS) {
    for (const rep of reps.filter((r) => r.position === pos.key)) {
      for (const k of perRep.filter((kk) => kk.roleKey === pos.key)) {
        const v = dailyValues.get(`${k.id}|${rep.id}`);
        if (v === undefined) continue;
        const goal = resolveGoalWith(targets, k, rep.id, month);
        if (goal === null || k.goalKind === "tracked") continue;
        const s = statusVsGoal(k.goalKind, v, goal);
        if (s === "hit") onGoal += 1;
        else if (s === "miss") behind += 1;
      }
    }
  }

  const monthlyGoaled = teamMonthly.filter((k) => k.goalValue !== null);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-auto bg-brand-navy text-white">
      <meta httpEquiv="refresh" content="60" />

      {/* Header */}
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-8 py-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-gold text-xl font-black text-brand-navy">
            FO
          </span>
          <div>
            <h1 className="text-3xl font-black leading-none tracking-tight">Team Scoreboard</h1>
            <p className="text-sm text-white/50">Freedom Offers · live</p>
          </div>
        </div>
        <div className="flex items-center gap-8">
          <Pulse value={onGoal} label="ON GOAL" tone="text-emerald-400" />
          <Pulse value={behind} label="BEHIND" tone={behind ? "text-rose-400" : "text-slate-400"} />
          <Pulse value={openAlerts} label="ALERTS" tone={openAlerts ? "text-amber-300" : "text-slate-400"} />
          <div className="border-l border-white/10 pl-8 text-right">
            <div className="text-2xl font-bold text-brand-gold-soft">{friendlyDate(date)}</div>
          </div>
        </div>
      </header>

      {/* Month pace strip */}
      <div className="grid grid-cols-2 gap-4 px-8 py-5 md:grid-cols-4">
        {monthlyGoaled.map((k) => {
          const mtd = mtdSums.get(k.id) ?? 0;
          const goal = resolveGoalWith(targets, k, null, month);
          const s = statusVsPace(k.goalKind, mtd, goal, fraction);
          const pct = goal ? Math.min(100, (mtd / goal) * 100) : 0;
          return (
            <div key={k.id} className="rounded-2xl bg-brand-navy-2 p-5 ring-1 ring-white/10">
              <div className="text-base text-white/55">{k.emoji} {k.name} <span className="text-white/30">/mo</span></div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={`text-5xl font-black tabular-nums ${tone(s)}`}>{formatValue(k.unit as Unit, mtd)}</span>
                <span className="text-lg text-white/35">/ {formatValue(k.unit as Unit, goal)}</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${s === "hit" ? "bg-emerald-400" : s === "close" ? "bg-amber-300" : "bg-rose-400"}`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative">
                  <span className="absolute -top-2 h-2 w-0.5 bg-white/50" style={{ left: `${fraction * 100}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Goal streaks */}
      {streaks.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-8 pb-2">
          <span className="text-base font-bold uppercase tracking-widest text-brand-gold-soft">🔥 On a roll</span>
          {streaks.slice(0, 6).map((s) => (
            <span key={s.userId} className="inline-flex items-center gap-2 rounded-full bg-orange-500/15 px-4 py-1.5 ring-1 ring-orange-400/30">
              <span className="text-xl font-black text-orange-300">{s.name}</span>
              <span className="text-xl font-black tabular-nums text-orange-200">🔥 {s.days}-day</span>
              <span className="text-sm text-white/40">{s.kpiEmoji} {s.kpiName}</span>
            </span>
          ))}
        </div>
      )}

      {/* Role tables */}
      <div className="flex-1 space-y-6 px-8 pb-8">
        {POSITIONS.map((pos) => {
          const roleReps = reps.filter((r) => r.position === pos.key);
          const roleKpis = perRep.filter((k) => k.roleKey === pos.key);
          if (roleReps.length === 0) return null;
          return (
            <RoleTable
              key={pos.key}
              emoji={pos.emoji}
              label={pos.label}
              reps={roleReps}
              kpis={roleKpis}
              dailyValues={dailyValues}
              targets={targets}
              month={month}
            />
          );
        })}
      </div>
    </div>
  );
}

function Pulse({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="text-center">
      <div className={`text-4xl font-black tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs font-semibold tracking-widest text-white/40">{label}</div>
    </div>
  );
}

function RoleTable({
  emoji,
  label,
  reps,
  kpis,
  dailyValues,
  targets,
  month,
}: {
  emoji: string;
  label: string;
  reps: User[];
  kpis: Kpi[];
  dailyValues: Map<string, number>;
  targets: Target[];
  month: string;
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-2xl font-extrabold">
        <span className="h-6 w-1.5 rounded-full bg-brand-gold" />
        {emoji} {label}
      </h2>
      <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
        <table className="w-full">
          <thead>
            <tr className="bg-white/5 text-left text-sm uppercase tracking-wide text-white/45">
              <th className="px-6 py-3 font-semibold">Rep</th>
              {kpis.map((k) => (
                <th key={k.id} className="px-3 py-3 text-center font-semibold">
                  {k.emoji} {k.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reps.map((rep) => (
              <tr key={rep.id} className="border-t border-white/5">
                <td className="px-6 py-4 text-2xl font-black">{rep.name}</td>
                {kpis.map((k) => {
                  const v = dailyValues.get(`${k.id}|${rep.id}`) ?? null;
                  const goal = resolveGoalWith(targets, k, rep.id, month);
                  const s: Status = v === null ? "none" : statusVsGoal(k.goalKind, v, goal);
                  return (
                    <td key={k.id} className="px-3 py-3 text-center">
                      <span className={`inline-flex min-w-20 flex-col items-center rounded-xl px-3 py-2 ring-1 ${chipBg(s)}`}>
                        <span className={`text-3xl font-black tabular-nums ${tone(s)}`}>
                          {v === null ? "—" : formatValue(k.unit as Unit, v)}
                        </span>
                        {goal !== null && (
                          <span className="text-xs text-white/35">/ {formatValue(k.unit as Unit, goal)}</span>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
