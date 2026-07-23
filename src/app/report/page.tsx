import {
  getActiveReps,
  getKpis,
  getRangeSums,
  getSettings,
  getAllTargets,
  resolveGoalWith,
} from "@/lib/data";
import { todayStr, lastWeekRange, currentWeekRange, datesInRange, monthBounds, monthOf } from "@/lib/date";
import { formatValue, type Unit } from "@/lib/format";
import { POSITIONS } from "@/lib/roles";
import { KpiLabel } from "@/lib/kpiIcons";
import { getCurrentUser, isManager } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import RepRoleBars from "@/components/RepRoleBars";
import CrmActivityStrip from "@/components/CrmActivityStrip";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Pretty label for a single day, e.g. "Mon, Jun 22".
function dayLabel(d: string): string {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; week?: string; range?: string; prev?: string; synced?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const today = sp.date ?? todayStr(settings.orgTimezone);
  // Day / week / month view; ?prev=1 shows the previous one (yesterday / last week / last month).
  const range = sp.range === "day" || sp.range === "month" ? sp.range : "week";
  const prev = sp.prev === "1" || sp.week === "last"; // ?week=last kept for old links
  let wk: { start: string; end: string; label: string };
  if (range === "day") {
    const d = new Date(today + "T00:00:00Z");
    if (prev) d.setUTCDate(d.getUTCDate() - 1);
    const ds = d.toISOString().slice(0, 10);
    wk = { start: ds, end: ds, label: dayLabel(ds) };
  } else if (range === "month") {
    let m = monthOf(today);
    if (prev) { const [y, mm] = m.split("-").map(Number); const pd = new Date(Date.UTC(y, mm - 2, 1)); m = `${pd.getUTCFullYear()}-${String(pd.getUTCMonth() + 1).padStart(2, "0")}`; }
    const mb = monthBounds(`${m}-01`);
    wk = { start: `${m}-01`, end: mb.end, label: new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) };
  } else {
    wk = prev ? lastWeekRange(today) : currentWeekRange(today);
  }
  const rangeNoun = range === "day" ? "day" : range === "month" ? "month" : "week";

  // --- Calendar navigation: jump to any date, or step one range at a time. Everything
  // anchors on ?date=, so Prev/Next just shift that anchor by a day / week / month. ---
  const dateQ = sp.date ? `&date=${encodeURIComponent(sp.date)}` : "";
  const shiftDays = (dateStr: string, n: number) => { const d = new Date(dateStr + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const shiftMonths = (dateStr: string, n: number) => { const [y, mm] = dateStr.split("-").map(Number); return new Date(Date.UTC(y, mm - 1 + n, 1)).toISOString().slice(0, 10); };
  const stepDate = (dir: number) => range === "day" ? shiftDays(wk.start, dir) : range === "month" ? shiftMonths(wk.start, dir) : shiftDays(wk.start, dir * 7);
  const todayAnchorS = todayStr(settings.orgTimezone);
  const curAnchor = range === "day" ? todayAnchorS : range === "month" ? `${monthOf(todayAnchorS)}-01` : currentWeekRange(todayAnchorS).start;
  const nextDisabled = stepDate(1) > curAnchor; // don't let Next walk into the future

  const [reps, perRepKpis, teamKpis, sums, targets] = await Promise.all([
    getActiveReps(),
    getKpis({ scope: "per_rep", computed: false }),
    getKpis({ scope: "team", computed: false, cadence: "daily" }),
    getRangeSums(wk.start, wk.end),
    getAllTargets(),
  ]);
  // Working days in the week → turns each rep's per-day goal into a weekly target,
  // so the scoreboard shows % against each person's OWN goal (fair across hours).
  const month = wk.start.slice(0, 7);
  const workdays = Math.max(1, datesInRange(wk.start, wk.end).filter((d) => {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    return dow >= 1 && dow <= 5;
  }).length);

  // The activity scoreboard stays visible to everyone; the company-money
  // sections below (revenue pipeline, active-deal profits) are managers-only.
  const me = await getCurrentUser();
  const manager = isManager(me);

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
          <h1 className="text-2xl font-extrabold tracking-tight">KPI Reports</h1>
          <p className="text-slate-500">{prev ? `Previous ${rangeNoun}` : `This ${rangeNoun}`} · {wk.label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Day / Week / Month — keep whatever date is anchored so switching view stays put */}
          <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-200">
            {(["day", "week", "month"] as const).map((rg) => (
              <a key={rg} href={`/report?range=${rg}${dateQ}`} className={`px-3 py-1.5 text-xs font-semibold capitalize ${range === rg ? "bg-brand-navy text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>{rg}</a>
            ))}
          </div>
          {/* Jump straight to any date on the calendar */}
          <form action="/report" method="get" className="flex items-center gap-1.5">
            <input type="hidden" name="range" value={range} />
            <label className="text-xs font-semibold text-slate-500">Jump to</label>
            <input type="date" name="date" defaultValue={wk.start} max={todayStr(settings.orgTimezone)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />
            <button className="rounded-lg bg-brand-navy px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy-700">Go</button>
          </form>
          {/* Prev / Next step through one range at a time */}
          <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-200">
            <a href={`/report?range=${range}&date=${encodeURIComponent(stepDate(-1))}`} className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100" title={`Previous ${rangeNoun}`}>← Prev</a>
            <a href={`/report?range=${range}${nextDisabled ? "" : `&date=${encodeURIComponent(stepDate(1))}`}`} aria-disabled={nextDisabled} className={`px-3 py-1.5 text-xs font-semibold ${nextDisabled ? "cursor-not-allowed text-slate-300" : "text-slate-600 hover:bg-slate-100"}`} title={`Next ${rangeNoun}`}>Next →</a>
          </div>
          <a href="/report" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100" title="Back to the current period">Today</a>
        </div>
      </div>
      {sp.synced && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Synced from REI Reply — KPIs are current.</div>}

      {/* CRM activity — auto-pulled through the day; managers only */}
      {manager && <CrmActivityStrip />}

      {/* ===== KPIs at a glance — team totals (everyone) ===== */}
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

      {/* ===== Full team KPIs by role (everyone — the scoreboard) ===== */}
      <section>
        <SectionTitle title="② Team KPIs" subtitle={`Every rep's ${rangeNoun} totals by role`} accent="bg-sky-400" />
        <div className="space-y-5">
          {POSITIONS.map((pos) => {
            const roleReps = reps.filter((r) => r.position === pos.key);
            const roleKpis = perRepKpis.filter((k) => k.roleKey === pos.key);
            if (roleReps.length === 0) return null;
            return (
              <RepRoleBars
                key={pos.key}
                emoji={pos.emoji}
                label={pos.label}
                reps={roleReps}
                kpis={roleKpis}
                cell={(repId, k) => {
                  const val = sums.get(`${k.id}|${repId}`) ?? 0;
                  const dailyGoal = k.goalKind === "at_least" ? resolveGoalWith(targets, k, repId, month) : null;
                  const weeklyGoal = dailyGoal != null && dailyGoal > 0 ? dailyGoal * workdays : null;
                  const pct = weeklyGoal ? Math.min(100, (val / weeklyGoal) * 100) : null;
                  const status = weeklyGoal ? (val >= weeklyGoal ? "hit" : val >= weeklyGoal * 0.7 ? "close" : "miss") : "tracked";
                  return { value: val, pct, status, goalText: weeklyGoal ? `/ ${formatValue(k.unit as Unit, weeklyGoal)} ${rangeNoun === "day" ? "day" : rangeNoun}` : undefined };
                }}
              />
            );
          })}
        </div>
      </section>

      <p className="text-center text-xs text-slate-400">
        Live report · always current · pull into the Canva deck for the Monday 1:30 PT meeting.
      </p>
    </div>
  );
}

