import { readDreiFeed } from "@/lib/directrei-sync";
import { db } from "@/lib/db";
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
  // ✍️ Signed Contract type notes for the period ("novation — Flores" chips)
  const signedNotes = await db.entry.findMany({
    where: { date: { gte: wk.start, lte: wk.end }, note: { not: "" }, kpi: { key: "acq_signed" } },
    select: { date: true, note: true, user: { select: { name: true } } },
    orderBy: { date: "desc" }, take: 20,
  });
  const drei = await readDreiFeed().catch(() => null);
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
  // Roll up notable per-rep KPIs to a team number.
  const rollupKeys = ["appts_set", "appts_taken", "deals_sold", "new_buyers"];
  for (const k of perRepKpis.filter((x) => rollupKeys.includes(x.key))) {
    let total = 0;
    for (const r of reps) total += sums.get(`${k.id}|${r.id}`) ?? 0;
    glance.push({ key: k.key, emoji: k.emoji, name: k.name, value: formatValue(k.unit as Unit, total) });
  }

  // The glance reads as a story in three bands (Jon 2026-10-04 — "cleaner,
  // more visual, like the Apple layout"): lead economics → marketing
  // responses → the offer trail, each trail step summed across the team.
  const sumPerRep = (key: string) => {
    const k = perRepKpis.find((x) => x.key === key);
    if (!k) return 0;
    let t = 0;
    for (const r of reps) t += sums.get(`${k.id}|${r.id}`) ?? 0;
    return t;
  };
  const teamByKey = (key: string) => {
    const k = teamKpis.find((x) => x.key === key);
    return k ? sums.get(`${k.id}|`) ?? 0 : null;
  };
  const econNames = new Set(["PPL Leads (Purchased/Inbound)", "Lead Refunds Requested", "Lead Refunds Approved", "Lead Refunds Rejected"]);
  const trailNames = new Set(["Deals Sent to Buyers"]);
  const econCards = glance.filter((g) => econNames.has(g.name));
  const marketingCards = glance.filter((g) => !econNames.has(g.name) && !trailNames.has(g.name));
  // Jon 2026-10-04: the trail reads in deal order — we sign it FIRST, THEN
  // dispo sends it to buyers.
  const trail = [
    { name: "Verbal Offers Made", value: sumPerRep("offers_made") },
    { name: "Contracts Sent", value: sumPerRep("acq_contracts_sent") },
    { name: "Contracts Signed", value: sumPerRep("contracts_signed") + sumPerRep("acq_signed") + sumPerRep("acq_signed_assignment") + sumPerRep("acq_signed_novation") + sumPerRep("acq_signed_creative") + sumPerRep("acq_signed_listing") },
    { name: "Deals Sent to Buyers", value: teamByKey("deals_sent") ?? sumPerRep("deals_sent") },
  ];

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

      {/* ===== KPIs at a glance — three story bands (lead $ → responses → offer trail) ===== */}
      <section>
        <SectionTitle title="① KPIs at a Glance" subtitle={`Team totals for ${wk.label}`} accent="bg-brand-gold" />
        <div className="space-y-4">
          {econCards.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-600">💰 Lead economics</div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {econCards.map((g, i) => (
                  <Card key={i} className="border-t-2 border-amber-300 p-4">
                    <div className="text-xs font-medium text-slate-500"><KpiLabel kpiKey={g.key} name={g.name} /></div>
                    <div className="mt-1 text-3xl font-extrabold tabular-nums text-slate-800">{g.value}</div>
                  </Card>
                ))}
              </div>
            </div>
          )}
          {marketingCards.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-600">📣 Marketing responses</div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {marketingCards.map((g, i) => (
                  <Card key={i} className="border-t-2 border-sky-300 p-4">
                    <div className="text-xs font-medium text-slate-500"><KpiLabel kpiKey={g.key} name={g.name} /></div>
                    <div className="mt-1 text-3xl font-extrabold tabular-nums text-slate-800">{g.value}</div>
                  </Card>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-600">🤝 Offer trail</div>
            <Card className="border-t-2 border-emerald-300 p-4">
              <div className="flex flex-wrap items-center justify-between gap-y-3">
                {trail.map((t, i) => (
                  <div key={t.name} className="flex items-center">
                    {i > 0 && <span className="mx-3 hidden text-xl text-slate-300 sm:block">→</span>}
                    <div className="min-w-[7.5rem] text-center sm:text-left">
                      <div className="text-3xl font-extrabold tabular-nums text-slate-800">{t.value}</div>
                      <div className="text-xs font-medium text-slate-500">{t.name}</div>
                    </div>
                  </div>
                ))}
              </div>
              {signedNotes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-emerald-100 pt-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">✍️ What got signed:</span>
                  {signedNotes.map((n, i) => (
                    <span key={i} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-emerald-200">{n.note}{n.user ? ` · ${n.user.name.split(" ")[0]}` : ""} · {n.date.slice(5)}</span>
                  ))}
                </div>
              )}
            </Card>
          </div>
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
            const dreiSide = drei && pos.key === "acquisitions" ? drei.seller : drei && pos.key === "dispositions" ? drei.buyer : null;
            const moneyKpis = roleKpis.filter((k) => k.category === "green");
            const activityKpis = roleKpis.filter((k) => k.category !== "green");
            return (
              <div key={pos.key} className="space-y-2">
                {moneyKpis.length > 0 && (
                  <RepRoleBars
                    emoji="💰"
                    label={`${pos.label} — Money movers`}
                    reps={roleReps}
                    kpis={moneyKpis}
                    cell={(repId, k) => {
                      const val = sums.get(`${k.id}|${repId}`) ?? 0;
                      const dailyGoal = k.goalKind === "at_least" ? resolveGoalWith(targets, k, repId, month) : null;
                      const weeklyGoal = dailyGoal != null && dailyGoal > 0 ? dailyGoal * workdays : null;
                      const pct = weeklyGoal ? Math.min(100, (val / weeklyGoal) * 100) : null;
                      const status = weeklyGoal ? (val >= weeklyGoal ? "hit" : val >= weeklyGoal * 0.7 ? "close" : "miss") : "tracked";
                      return { value: val, pct, status, goalText: weeklyGoal ? `/ ${formatValue(k.unit as Unit, weeklyGoal)} ${rangeNoun === "day" ? "day" : rangeNoun}` : undefined };
                    }}
                  />
                )}
                <RepRoleBars
                  emoji="⚡"
                  label={`${pos.label} — Activity`}
                  reps={roleReps}
                  kpis={activityKpis}
                  cell={(repId, k) => {
                    const val = sums.get(`${k.id}|${repId}`) ?? 0;
                    const dailyGoal = k.goalKind === "at_least" ? resolveGoalWith(targets, k, repId, month) : null;
                    const weeklyGoal = dailyGoal != null && dailyGoal > 0 ? dailyGoal * workdays : null;
                    const pct = weeklyGoal ? Math.min(100, (val / weeklyGoal) * 100) : null;
                    const status = weeklyGoal ? (val >= weeklyGoal ? "hit" : val >= weeklyGoal * 0.7 ? "close" : "miss") : "tracked";
                    return { value: val, pct, status, goalText: weeklyGoal ? `/ ${formatValue(k.unit as Unit, weeklyGoal)} ${rangeNoun === "day" ? "day" : rangeNoun}` : undefined };
                  }}
                />
                {dreiSide && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-indigo-50/60 px-3 py-1.5 text-[11px] text-slate-600 ring-1 ring-indigo-100">
                    <span className="font-bold text-indigo-700">📨 Direct REI auto-outreach ({pos.key === "acquisitions" ? "sellers" : "buyers"})</span>
                    <span><b>{dreiSide.new7d}</b> leads loaded this wk <span className="text-slate-400">(the AI texts/emails/calls them for us)</span></span>
                    <span><b>{dreiSide.replies7d}</b> wrote back <span className="text-slate-400">(💬{dreiSide.smsReplies7d} text · ✉️{dreiSide.emailReplies7d} email · 📞{Math.max(0, dreiSide.replies7d - dreiSide.smsReplies7d - dreiSide.emailReplies7d)} call campaigns)</span></span>
                    <span className="font-semibold text-amber-600">→ warm — work these first</span>
                  </div>
                )}
              </div>
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

