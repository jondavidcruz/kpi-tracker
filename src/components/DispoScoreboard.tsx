import { Card } from "@/components/ui";

// 📊 Dispo accountability scoreboard (Jon 2026-10-21: "hold Marie & Sharyn
// accountable… get the deal out to more agents & developers every hour"). Live,
// honest numbers for TODAY — who's pushing deals out, who's idle, and how many
// unique agents/developers have been reached. No self-reporting; all from the log.
export type RepRow = { name: string; dealsWorked: number; outreach: number; agentsWorked: number; lastAgoMin: number | null; perHour: number };
export type TeamStats = { dealsPushed: number; totalActive: number; agentsReached: number; thisHour: number };

export default function DispoScoreboard({ reps, team }: { reps: RepRow[]; team: TeamStats }) {
  const pushedPct = team.totalActive > 0 ? Math.round((team.dealsPushed / team.totalActive) * 100) : 0;
  return (
    <Card className="p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">📊 Today&apos;s pace — deals out to buyers</span>
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">live from activity</span>
      </div>

      {/* team throughput */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat big={`${team.dealsPushed}/${team.totalActive}`} label="Deals pushed today" sub={`${pushedPct}% of active`} tone={pushedPct >= 60 ? "good" : pushedPct >= 30 ? "warn" : "bad"} />
        <Stat big={`${team.totalActive - team.dealsPushed}`} label="Untouched today" sub="backlog to clear" tone={team.totalActive - team.dealsPushed === 0 ? "good" : team.totalActive - team.dealsPushed <= 3 ? "warn" : "bad"} />
        <Stat big={`${team.agentsReached}`} label="Agents/devs reached" sub="unique, today" tone={team.agentsReached >= 15 ? "good" : team.agentsReached >= 5 ? "warn" : "bad"} />
        <Stat big={`${team.thisHour}`} label="Reached this hour" sub="keep it moving" tone={team.thisHour >= 3 ? "good" : team.thisHour >= 1 ? "warn" : "bad"} />
      </div>

      {/* per-rep accountability */}
      <div className="mt-2 overflow-hidden rounded-lg ring-1 ring-slate-100">
        {reps.length === 0 && <div className="px-3 py-2 text-[12px] text-slate-400">No dispo reps on file.</div>}
        {reps.map((r, i) => {
          const idle = r.lastAgoMin != null && r.lastAgoMin > 45;
          const cold = r.lastAgoMin == null;
          return (
            <div key={r.name} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[12px] ${i ? "border-t border-slate-100" : ""} ${idle || cold ? "bg-amber-50/60" : ""}`}>
              <span className="min-w-[110px] font-bold text-slate-800">{r.name.split(" ")[0]}</span>
              <span className="text-slate-600"><b className="text-slate-900">{r.dealsWorked}</b> deals</span>
              <span className="text-slate-600"><b className="text-slate-900">{r.agentsWorked}</b> agents/devs</span>
              <span className="text-slate-600"><b className="text-slate-900">{r.outreach}</b> touches</span>
              <span className="text-slate-500" title="outreach per hour of shift so far">{r.perHour}/hr</span>
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${cold ? "bg-red-100 text-red-700" : idle ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
                {cold ? "⚠️ nothing logged today" : idle ? `💤 idle ${r.lastAgoMin}m` : `🟢 active ${r.lastAgoMin}m ago`}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10px] text-slate-400">Counts every call, text, email and buyer-tracker touch on dispo deals today. Idle = no activity in 45+ min. The goal is more deals out to more buyers, every hour of shift.</p>
    </Card>
  );
}

function Stat({ big, label, sub, tone }: { big: string; label: string; sub: string; tone: "good" | "warn" | "bad" }) {
  const cls = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-red-600";
  return (
    <div className="rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-100">
      <div className={`text-xl font-extrabold tabular-nums ${cls}`}>{big}</div>
      <div className="text-[11px] font-semibold text-slate-600">{label}</div>
      <div className="text-[10px] text-slate-400">{sub}</div>
    </div>
  );
}
