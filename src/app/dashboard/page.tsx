import Link from "next/link";
import {
  getActiveReps,
  getAllTargets,
  getDailyValues,
  getKpis,
  getMonthToDateSums,
  getOpenDeals,
  getSettings,
  resolveGoalWith,
} from "@/lib/data";
import { todayStr, friendlyDate, paceFraction, monthOf, datesInRange } from "@/lib/date";
import { quarterOf } from "@/lib/eos";
import { formatValue, type Unit } from "@/lib/format";
import { statusClasses, statusVsGoal, statusVsPace, alertSeverity, isKpiHiddenForRep, type Status } from "@/lib/kpi";
import { dailyGap, monthlyGap, monthlyCatchup, buildCoaching } from "@/lib/gap";
import { dealsNeedingAttention } from "@/lib/deals";
import { findPipCandidates } from "@/lib/pip";
import { getDailyTrends } from "@/lib/trends";
import { getAwardBoard, getAiChampions } from "@/lib/awards";
import { POSITIONS } from "@/lib/roles";
import { KpiLabel } from "@/lib/kpiIcons";
import RecognitionBoards from "@/components/RecognitionBoards";
import DealFunnel from "@/components/DealFunnel";
import CrmActivityStrip from "@/components/CrmActivityStrip";
import { db } from "@/lib/db";
import { getCurrentUser, isManager, canAccessPayroll } from "@/lib/auth";
import { Card, SectionTitle, Legend, ProgressBar, MetricCard, Pill } from "@/components/ui";
import { CircleCheck, TrendingDown, Bell, Users, Banknote, ShieldAlert, Building2, FileSignature, type LucideIcon } from "lucide-react";
import type { Kpi, Target, User } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface GapItem {
  who: string;
  roleEmoji: string;
  kpiName: string;
  kpiKey: string;
  emoji: string;
  category: string;
  unit: Unit;
  value: number;
  goal: number;
  pct: number;
  catchup: string;
  diagnose: string;
  plan: string[];
  weight: number; // sort key: higher = more urgent
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  // Validate the ?date= param — a malformed value (e.g. ?date=garbage) would flow
  // into date math and blank/crash sections. Fall back to today when it's not YYYY-MM-DD.
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayStr(settings.orgTimezone);
  const month = monthOf(date);
  const fraction = paceFraction(date);

  // One parallel batch — everything here is independent of each other's results, so
  // they run concurrently instead of in a chain of sequential round-trips.
  const [reps, perRepKpis, teamDaily, teamMonthly, dailyValues, mtdSums, targets, openAlerts, openDeals, pipCandidates, trends, awardBoard, aiChampions, me] =
    await Promise.all([
      getActiveReps(),
      getKpis({ scope: "per_rep", computed: false }),
      getKpis({ scope: "team", cadence: "daily", computed: false }),
      getKpis({ scope: "team", cadence: "monthly", computed: false }),
      getDailyValues(date),
      getMonthToDateSums(date),
      getAllTargets(),
      db.alert.count({ where: { status: "open" } }),
      getOpenDeals(),
      findPipCandidates(date),
      getDailyTrends(date, 14),
      getAwardBoard(),
      getAiChampions(),
      getCurrentUser(),
    ]);
  const agingDeals = dealsNeedingAttention(openDeals, date);

  // --- Company scoreboard: auto-tallied from the real sources (acquisitions
  // entries + the Escrow & Closing tracker), so nothing needs double-entry. ---
  const showMoney = isManager(me);
  const cSuite = canAccessPayroll(me); // Jon / Viktoriia / Enrico — see expense-derived figures
  const monthStart = `${month}-01`;
  const year = date.slice(0, 4);
  const yearStart = `${year}-01-01`;
  const [acqKpis, closings, closedDeals, ytdOpExAgg] = await Promise.all([
    db.kpi.findMany({ where: { key: { in: ["acq_contracts_sent", "acq_signed_assignment", "acq_signed_novation", "acq_signed_listing", "acq_signed_creative"] } }, select: { id: true, key: true } }),
    db.closing.findMany({ where: { status: "fell_through" }, select: { status: true, closeDate: true } }),
    db.closedDeal.findMany({ where: { year: Number(year) }, select: { profit: true, month: true } }), // HUD-backed ledger
    db.expenseLine.aggregate({ where: { month: { startsWith: year } }, _sum: { actual: true } }), // YTD operating expenses (P&L)
  ]);
  const sentId = acqKpis.find((k) => k.key === "acq_contracts_sent")?.id;
  const signedIds = acqKpis.filter((k) => k.key.startsWith("acq_signed_")).map((k) => k.id);
  const sumEntries = async (kpiIds: string[]) => {
    if (kpiIds.length === 0) return 0;
    const rows = await db.entry.findMany({ where: { kpiId: { in: kpiIds }, date: { gte: monthStart, lte: date } }, select: { value: true } });
    return rows.reduce((s, r) => s + r.value, 0);
  };
  const [contractsSentMonth, contractsSignedMonth] = await Promise.all([
    sumEntries(sentId ? [sentId] : []),
    sumEntries(signedIds),
  ]);
  // Closed deals + revenue come from the HUD-backed ClosedDeal ledger; company net =
  // that revenue minus year-to-date operating expenses from the P&L.
  const closedCount = closedDeals.length;
  const grossRevenue = closedDeals.reduce((s, c) => s + c.profit, 0);
  const ytdOpEx = ytdOpExAgg._sum.actual ?? 0;
  const netProfit = grossRevenue - ytdOpEx;
  const falloutYTD = closings.filter((c) => c.status === "fell_through" && (c.closeDate ? c.closeDate >= yearStart : true)).length;
  const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

  // --- Team 360 nudge: does THIS person still owe peer reviews this quarter? ---
  // Everyone rates everyone (including themselves), so "left to rate" = active teammates
  // minus the distinct people I've already submitted for this quarter. Banner self-clears
  // once they finish, so it naturally disappears without any scheduled cleanup.
  const t360Quarter = quarterOf(date);
  let t360Remaining = 0;
  if (me) {
    try {
      const [activeUserCount, myRated] = await Promise.all([
        db.user.count({ where: { active: true } }),
        db.peerAssessment.findMany({ where: { quarter: t360Quarter, raterId: me.id }, distinct: ["subjectId"], select: { subjectId: true } }),
      ]);
      t360Remaining = Math.max(0, activeUserCount - myRated.length);
    } catch { t360Remaining = 0; }
  }

  // --- Deal funnel (this month): leads → opportunities → offers → contracts → closed ---
  const FUNNEL_KEYS = ["ppl_leads", "text_responses", "direct_mail_responses", "quality_convos", "offers_made", "acq_signed_assignment", "acq_signed_novation", "acq_signed_listing", "acq_signed_creative"];
  const funnelKpis = await db.kpi.findMany({ where: { key: { in: FUNNEL_KEYS } }, select: { id: true, key: true } });
  const fIdToKey = new Map(funnelKpis.map((k) => [k.id, k.key]));
  const fEntries = await db.entry.findMany({ where: { kpiId: { in: funnelKpis.map((k) => k.id) }, date: { gte: monthStart, lte: date } }, select: { kpiId: true, value: true } });
  const byKey: Record<string, number> = {};
  for (const e of fEntries) { const key = fIdToKey.get(e.kpiId); if (key) byKey[key] = (byKey[key] ?? 0) + e.value; }
  const kv = (key: string) => byKey[key] ?? 0;
  const moNum = Number(month.slice(5, 7));
  const closedThisMonth = closedDeals.filter((c) => c.month === moNum).length;
  const funnelStages = [
    { label: "Leads", count: kv("ppl_leads") + kv("text_responses") + kv("direct_mail_responses"), source: "PPL + SMS + mail" },
    { label: "Opportunities", count: kv("quality_convos"), source: "quality conversations" },
    { label: "Offers", count: kv("offers_made"), source: "verbal offers" },
    { label: "Contracts", count: kv("acq_signed_assignment") + kv("acq_signed_novation") + kv("acq_signed_listing") + kv("acq_signed_creative"), source: "signed" },
    { label: "Closed", count: closedThisMonth, source: "escrow → closed" },
  ];
  const funnelHasData = funnelStages.some((s) => s.count > 0);

  // Wire the money pace rows to REAL data — these team-monthly KPIs (deals closed,
  // revenue, spend) aren't entered by hand, so they sat at $0. Pull them live from
  // the closed-deal ledger + the P&L (ExpenseLine) instead.
  const monthExp = await db.expenseLine.findMany({ where: { month }, select: { category: true, actual: true, label: true } });
  const marketingLines = monthExp.filter((e) => e.category === "marketing");
  const marketingMonth = marketingLines.reduce((s, e) => s + e.actual, 0);
  const opexMonth = monthExp.reduce((s, e) => s + e.actual, 0);
  const grossRevMonth = closedDeals.filter((c) => c.month === moNum).reduce((s, c) => s + c.profit, 0);
  const monthlyIdByKey = new Map(teamMonthly.map((k) => [k.key, k.id]));
  const setMtd = (key: string, val: number) => { const id = monthlyIdByKey.get(key); if (id != null) mtdSums.set(id, val); };
  setMtd("deals_closed", closedThisMonth);
  setMtd("gross_revenue", grossRevMonth);
  setMtd("marketing_spend", marketingMonth);
  setMtd("operating_expenses", opexMonth);
  // Per-channel spend — split the marketing P&L lines by label keyword (PPL / SMS / mail).
  const chSpend = (re: RegExp) => marketingLines.filter((e) => re.test(e.label)).reduce((s, e) => s + e.actual, 0);
  setMtd("spend_ppl", chSpend(/ppl|pay.?per.?lead|inbound/i));
  setMtd("spend_sms", chSpend(/sms|text/i));
  setMtd("spend_mail", chSpend(/mail|postcard|letter/i));
  // Contracts sent + signed roll up the per-rep acquisitions KPIs for the month (already in mtdSums).
  const perRepIdByKey = new Map(perRepKpis.map((k) => [k.key, k.id]));
  const perRepMtd = (key: string) => { const id = perRepIdByKey.get(key); return id ? (mtdSums.get(id) ?? 0) : 0; };
  setMtd("contracts_sent", perRepMtd("acq_contracts_sent"));
  setMtd("contracts_signed", ["acq_signed_assignment", "acq_signed_novation", "acq_signed_listing", "acq_signed_creative"].reduce((s, k) => s + perRepMtd(k), 0));

  // --- Internet speed: today's recorded reading per rep + a 14-day history/trend ---
  const internetSpeedKpi = perRepKpis.find((k) => k.roleKey === "internet") ?? null;
  const [sy, sm, sd] = date.split("-").map(Number);
  const winStart = new Date(Date.UTC(sy, sm - 1, sd));
  winStart.setUTCDate(winStart.getUTCDate() - 13);
  const speedDays = datesInRange(winStart.toISOString().slice(0, 10), date); // 14 days incl. today
  const speedEntries = internetSpeedKpi
    ? await db.entry.findMany({
        where: { kpiId: internetSpeedKpi.id, date: { gte: speedDays[0], lte: date } },
        select: { userId: true, date: true, value: true },
      })
    : [];
  const speedMap = new Map<string, number>();
  for (const e of speedEntries) speedMap.set(`${e.userId}|${e.date}`, e.value);
  const speedReps = reps.filter((r) => r.tracksInternet);
  const onGoalSeries = trends.map((t) => t.onGoal);
  const behindSeries = trends.map((t) => t.behind);
  const loggedSeries = trends.map((t) => t.logged);
  const alertSeries = trends.map((t) => t.alertsRaised);
  const wkDelta = (s: number[]) => (s.length >= 6 ? s[s.length - 1] - s[s.length - 6] : 0);

  // --- Build the gap list (who's behind + how to close it) ---
  const gaps: GapItem[] = [];
  let onGoal = 0;
  const internetKpis = perRepKpis.filter((k) => k.roleKey === "internet");
  for (const pos of POSITIONS) {
    const roleReps = reps.filter((r) => r.position === pos.key);
    const roleKpis = perRepKpis.filter((k) => k.roleKey === pos.key);
    for (const rep of roleReps) {
      // each rep sees their role KPIs + internet KPI if they track it
      const repKpis = rep.tracksInternet ? [...roleKpis, ...internetKpis] : roleKpis;
      for (const k of repKpis) {
        const value = dailyValues.get(`${k.id}|${rep.id}`);
        if (value === undefined) continue;
        const goal = resolveGoalWith(targets, k, rep.id, month);
        if (goal === null || k.goalKind === "tracked") continue;
        const status = statusVsGoal(k.goalKind, value, goal);
        if (status === "hit") onGoal += 1;
        const g = dailyGap(k.goalKind, value, goal);
        if (g) {
          const coach = buildCoaching({ kpiKey: k.key, kpiName: k.name, unit: k.unit as Unit, gap: g, who: rep.name });
          gaps.push({
            who: rep.name,
            roleEmoji: pos.emoji,
            kpiName: k.name,
          kpiKey: k.key,
            emoji: k.emoji,
            category: k.category,
            unit: k.unit as Unit,
            value,
            goal,
            pct: goal ? (value / goal) * 100 : 0,
            catchup: coach.headline,
            diagnose: coach.diagnose,
            plan: coach.plan,
            weight: (k.category === "green" ? 1000 : 100) + (g.short / Math.max(1, goal)) * 100,
          });
        }
      }
    }
  }
  for (const k of teamMonthly) {
    const goal = resolveGoalWith(targets, k, null, month);
    if (goal === null || k.goalKind === "tracked") continue;
    const mtd = mtdSums.get(k.id) ?? 0;
    const g = monthlyGap(date, k.goalKind, mtd, goal);
    if (statusVsPace(k.goalKind, mtd, goal, fraction) === "hit") onGoal += 1;
    if (g) {
      const coach = buildCoaching({ kpiKey: k.key, kpiName: k.name, unit: k.unit as Unit, gap: g, who: null });
      gaps.push({
        who: "Team",
        roleEmoji: "🏢",
        kpiName: k.name,
        kpiKey: k.key,
        emoji: k.emoji,
        category: k.category,
        unit: k.unit as Unit,
        value: mtd,
        goal,
        pct: goal ? (mtd / goal) * 100 : 0,
        catchup: coach.headline,
        diagnose: coach.diagnose,
        plan: coach.plan,
        weight: (k.category === "green" ? 1000 : 100) + (g.behindPace / Math.max(1, goal)) * 100,
      });
    }
  }
  gaps.sort((a, b) => b.weight - a.weight);

  // Today's priorities: the few things actually worth acting on right now.
  const moneyGaps = gaps.filter((g) => g.category === "green").length;
  const repsLoggedToday = new Set([...dailyValues.keys()].map((k) => k.split("|")[1]).filter(Boolean)).size;
  const priorities: { Icon: LucideIcon; text: string; href: string; tone: string }[] = [];
  if (moneyGaps > 0) priorities.push({ Icon: Banknote, text: `${moneyGaps} money KPI${moneyGaps === 1 ? "" : "s"} behind today`, href: "/alerts", tone: "text-red-700 bg-red-50 ring-red-200" });
  if (pipCandidates.length > 0) priorities.push({ Icon: ShieldAlert, text: `${pipCandidates.length} rep-KPI${pipCandidates.length === 1 ? "" : "s"} PIP-eligible`, href: "/pip", tone: "text-orange-700 bg-orange-50 ring-orange-200" });
  if (agingDeals.length > 0) priorities.push({ Icon: Building2, text: `${agingDeals.length} deal${agingDeals.length === 1 ? "" : "s"} need attention`, href: "/report", tone: "text-violet-700 bg-violet-50 ring-violet-200" });

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Team dashboard</h1>
          <p className="text-sm text-slate-500">{friendlyDate(date)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/entry"
            className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-navy-700"
          >
            + Enter KPIs
          </Link>
        </div>
      </div>

      {/* Team 360 nudge — shows until this person finishes their peer reviews for the quarter */}
      {t360Remaining > 0 && (
        <Link href="/team-360" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 transition hover:bg-indigo-100">
          <span className="text-sm font-semibold text-indigo-900">🦸 Team 360 is open — rate your teammates&apos; superpowers &amp; growth areas. <span className="font-normal text-indigo-700">You have {t360Remaining} left to complete today.</span></span>
          <span className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white">Complete now →</span>
        </Link>
      )}

      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="On goal today" value={onGoal} icon={<CircleCheck size={18} />} spark={onGoalSeries} delta={wkDelta(onGoalSeries)} deltaTone={wkDelta(onGoalSeries) >= 0 ? "good" : "bad"} />
        <MetricCard label="Behind" value={gaps.length} icon={<TrendingDown size={18} />} spark={behindSeries} delta={wkDelta(behindSeries)} deltaTone={wkDelta(behindSeries) <= 0 ? "good" : "bad"} />
        <MetricCard label="Open alerts" value={openAlerts} icon={<Bell size={18} />} spark={alertSeries} hint={openAlerts ? "needs review" : "all clear"} hintTone={openAlerts ? "bad" : "good"} />
        <MetricCard label="Logged today" value={repsLoggedToday} icon={<Users size={18} />} spark={loggedSeries} delta={wkDelta(loggedSeries)} deltaTone={wkDelta(loggedSeries) >= 0 ? "good" : "neutral"} />
      </div>
      <p className="-mt-2 text-[11px] text-slate-400">Today&apos;s snapshot: <b>On goal</b> = KPIs hitting target · <b>Behind</b> = KPIs below target · <b>Open alerts</b> = misses needing review · <b>Logged today</b> = reps who entered KPIs. The mini graph on each card is that metric&apos;s last 14 days; ▲/▼ compares to last week.</p>

      {/* CRM activity — managers only: who's actually working the CRM today */}
      {isManager(me) && <CrmActivityStrip />}

      {/* Company scoreboard — acquisitions output (this month) + closings (this year) */}
      <section>
        <SectionTitle title="📊 Company scoreboard" subtitle={`Acquisitions output this month · closings year-to-date (${year})`} accent="bg-brand-gold" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Link href="/monthly" className="block"><MetricCard label="Contracts sent (mo)" value={Math.round(contractsSentMonth)} icon={<FileSignature size={18} />} hint="acquisitions" /></Link>
          <Link href="/monthly" className="block"><MetricCard label="Contracts signed (mo)" value={Math.round(contractsSignedMonth)} icon={<FileSignature size={18} />} hint="acquisitions" /></Link>
          <Link href="/closing" className="block"><MetricCard label={`Deals closed (${year})`} value={closedCount} icon={<Building2 size={18} />} hint={falloutYTD ? `${falloutYTD} fell through` : "dispositions"} hintTone={falloutYTD ? "bad" : "neutral"} /></Link>
          {showMoney && <Link href="/closing" className="block"><MetricCard label="Gross revenue (YTD)" value={usd(grossRevenue)} icon={<Banknote size={18} />} /></Link>}
          {cSuite ? (
            <Link href="/expenses" className="block"><MetricCard label="Net profit (YTD)" value={usd(netProfit)} icon={<Banknote size={18} />} hint="after expenses · C-suite" hintTone={netProfit >= 0 ? "good" : "bad"} /></Link>
          ) : !showMoney ? (
            <Card className="flex items-center justify-center p-3 text-center text-[11px] text-slate-400 lg:col-span-2">Revenue &amp; profit are visible to leadership.</Card>
          ) : null}
        </div>
        {showMoney && closedCount === 0 && (
          <p className="mt-2 text-[11px] text-slate-400">No closed deals recorded for {year} yet — add them in <Link href="/closing" className="font-semibold text-slate-500 underline">Escrow &amp; Closing</Link> (set status to “Closed”) and they&apos;ll tally here with net profit.</p>
        )}
      </section>

      {/* Deal funnel — this month */}
      <section>
        <SectionTitle title="🫙 Deal funnel" subtitle="This month: leads → opportunities → offers → contracts → closed (% = conversion from the stage above)" accent="bg-brand-navy" />
        <Card className="p-5">
          <DealFunnel stages={funnelStages} />
          {funnelHasData ? (
            <p className="mt-3 text-[11px] text-slate-400">Each stage is logged separately, so a stage can read over 100% of the one above it — e.g. conversations from leads generated in earlier months still count this month. <strong>Contracts</strong> here = contracts <em>signed</em>; <strong>Contracts sent (mo)</strong> above counts contracts <em>sent</em>, so the two differ. <strong>Closed</strong> fills in from Escrow &amp; Closing.</p>
          ) : (
            <p className="mt-3 text-[11px] text-slate-400">Nothing logged this month yet. The funnel fills in as the team logs leads, conversations, offers and contracts on <Link href="/entry" className="font-semibold text-slate-500 underline">Enter KPIs</Link>, and as deals are closed in Escrow &amp; Closing.</p>
          )}
        </Card>
      </section>

      {/* Gamified recognition */}
      <RecognitionBoards champions={awardBoard.champions} aiChampions={aiChampions} variant="light" />

      {/* Today's priorities — the short list worth acting on now */}
      {priorities.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-sm font-semibold text-slate-700">Today&apos;s priorities</div>
          <div className="flex flex-wrap gap-2">
            {priorities.map((p, i) => {
              const Icon = p.Icon;
              return (
                <Link key={i} href={p.href} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ${p.tone}`}>
                  <Icon size={16} /> {p.text} <span aria-hidden>→</span>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {/* Performance gaps */}
      <section>
        <SectionTitle
          title="Performance Gaps"
          subtitle="Who's behind today, and what it takes to close the gap"
          accent="bg-red-400"
        />
        <Card className="p-2">
          {gaps.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              🎉 Everyone is on goal or pace right now. Nothing to chase.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {gaps.slice(0, 8).map((g, i) => {
                const isMoney = g.category === "green";
                return (
                  <li key={i} className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-4">
                      <span
                        className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          isMoney ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {isMoney ? "MONEY" : "ACTIVITY"}
                      </span>
                      <div className="min-w-[150px] flex-1">
                        <div className="font-semibold text-slate-800">
                          {g.who} · <KpiLabel kpiKey={g.kpiKey} name={g.kpiName} />
                        </div>
                        <div className="text-sm text-slate-500">{g.catchup}</div>
                      </div>
                      <div className="w-40">
                        <div className="mb-1 flex justify-between text-xs font-medium">
                          <span className="text-slate-700 tabular-nums">{formatValue(g.unit, g.value)}</span>
                          <span className="text-slate-400 tabular-nums">/ {formatValue(g.unit, g.goal)}</span>
                        </div>
                        <ProgressBar pct={g.pct} status={isMoney ? "miss" : "close"} />
                      </div>
                    </div>
                    {/* Gap assessment + training plan */}
                    <details className="mt-2 ml-1 group">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700">
                        🔍 Gap assessment & training plan
                      </summary>
                      <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
                        <p className="text-slate-600"><span className="font-semibold">Why:</span> {g.diagnose}</p>
                        <p className="mt-1.5 font-semibold text-slate-700">How to fix it:</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">
                          {g.plan.map((p, j) => <li key={j}>{p}</li>)}
                        </ul>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      {/* Lead sources */}
      {teamDaily.length > 0 && (
        <section>
          <SectionTitle title="Lead Sources: Today" accent="bg-sky-400" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {teamDaily.map((k) => {
              const value = dailyValues.get(`${k.id}|`) ?? null;
              return (
                <Card key={k.id} className="p-4">
                  <div className="text-xs font-medium text-slate-500"><KpiLabel kpiKey={k.key} name={k.name} /></div>
                  <div className="mt-1 text-3xl font-extrabold tabular-nums text-slate-800">
                    {value === null ? "—" : formatValue(k.unit as Unit, value)}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Internet speed — today's reading + 2-week history & trend per rep */}
      <InternetSpeedSection
        kpi={internetSpeedKpi}
        reps={speedReps}
        days={speedDays}
        valueAt={(uid, d) => speedMap.get(`${uid}|${d}`) ?? null}
        goalFor={(uid) => (internetSpeedKpi ? resolveGoalWith(targets, internetSpeedKpi, uid, month) : null)}
      />

      {/* Role scorecards */}
      {POSITIONS.map((pos) => {
        const roleReps = reps.filter((r) => r.position === pos.key);
        const roleKpis = perRepKpis.filter((k) => k.roleKey === pos.key);
        if (roleReps.length === 0 && roleKpis.length === 0) return null;
        return (
          <RoleScorecard
            key={pos.key}
            title={`${pos.emoji} ${pos.label}`}
            blurb={pos.blurb}
            reps={roleReps}
            kpis={roleKpis}
            dailyValues={dailyValues}
            targets={targets}
            month={month}
          />
        );
      })}

      {/* Monthly pace */}
      <section>
        <SectionTitle title={`This Month: Pace (${month})`} accent="bg-emerald-400" />
        <Card className="divide-y divide-slate-100 p-0">
          {teamMonthly.map((k) => {
            const mtd = mtdSums.get(k.id) ?? 0;
            const goal = resolveGoalWith(targets, k, null, month);
            const status: Status = statusVsPace(k.goalKind, mtd, goal, fraction);
            const cls = statusClasses(status);
            const g = goal !== null ? monthlyGap(date, k.goalKind, mtd, goal) : null;
            const pct = goal ? (mtd / goal) * 100 : 0;
            return (
              <div key={k.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-40 shrink-0">
                  <div className="truncate text-sm font-medium text-slate-700"><KpiLabel kpiKey={k.key} name={k.name} /></div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {goal === null ? "Tracked" : g ? monthlyCatchup(k.unit as Unit, g) : "on pace"}
                  </div>
                </div>
                <div className="hidden flex-1 sm:block"><ProgressBar pct={pct} status={status} paceMarker={goal ? fraction * 100 : undefined} /></div>
                <div className="ml-auto w-28 shrink-0 text-right">
                  <span className={`text-xl font-extrabold tabular-nums ${cls.text}`}>{formatValue(k.unit as Unit, mtd)}</span>
                  {goal !== null && <span className="text-xs text-slate-400"> / {formatValue(k.unit as Unit, goal)}</span>}
                </div>
                <Pill tone={status === "hit" ? "good" : status === "close" ? "watch" : status === "miss" ? "bad" : "neutral"}>{cls.label}</Pill>
              </div>
            );
          })}
        </Card>
      </section>
    </div>
  );
}

function InternetSpeedSection({
  kpi,
  reps,
  days,
  valueAt,
  goalFor,
}: {
  kpi: Kpi | null;
  reps: User[];
  days: string[];
  valueAt: (userId: string, date: string) => number | null;
  goalFor: (userId: string) => number | null;
}) {
  if (!kpi || reps.length === 0) return null;
  const tone = (v: number | null, goal: number) =>
    v === null ? "text-slate-300" : v >= goal ? "text-emerald-600" : v >= 25 ? "text-amber-600" : "text-red-600";
  return (
    <section>
      <SectionTitle
        title="📡 Internet Speed — daily"
        subtitle="Today's reading plus the last 2 weeks. Red bars = below goal — watch for reps with chronic slow days."
        accent="bg-indigo-400"
      />
      <Card className="divide-y divide-slate-100">
        {reps.map((rep) => {
          const goal = goalFor(rep.id) ?? 50;
          const series = days.map((d) => ({ date: d, v: valueAt(rep.id, d) }));
          const recorded = series.filter((s): s is { date: string; v: number } => s.v !== null);
          const today = series.at(-1)?.v ?? null;
          const avg = recorded.length ? Math.round(recorded.reduce((a, b) => a + b.v, 0) / recorded.length) : null;
          const min = recorded.length ? Math.min(...recorded.map((s) => s.v)) : null;
          const lowDays = recorded.filter((s) => s.v < goal).length;
          const scaleMax = Math.max(goal, ...recorded.map((s) => s.v), 1);
          return (
            <div key={rep.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="w-32 shrink-0">
                <div className="font-semibold text-slate-800">{rep.name}</div>
                <div className={`text-2xl font-extrabold tabular-nums ${tone(today, goal)}`}>
                  {today === null ? "—" : today}
                  <span className="text-xs font-semibold text-slate-400"> Mbps</span>
                </div>
              </div>
              <div className="flex flex-1 items-end gap-0.5" style={{ height: 48, minWidth: 160 }}>
                {series.map((s) => {
                  const h = s.v === null ? 3 : Math.max(3, Math.round((s.v / scaleMax) * 46));
                  const c = s.v === null ? "bg-slate-200" : s.v >= goal ? "bg-emerald-400" : s.v >= 25 ? "bg-amber-400" : "bg-red-400";
                  return (
                    <div
                      key={s.date}
                      title={`${s.date}: ${s.v === null ? "no test" : `${s.v} Mbps`}`}
                      className={`flex-1 rounded-sm ${c}`}
                      style={{ height: h }}
                    />
                  );
                })}
              </div>
              <div className="w-44 shrink-0 text-right text-xs text-slate-500">
                <div>avg <span className="font-semibold tabular-nums text-slate-700">{avg ?? "—"}</span> · low <span className="font-semibold tabular-nums text-slate-700">{min ?? "—"}</span> Mbps</div>
                <div>goal {goal}+ · <span className={lowDays >= 3 ? "font-semibold text-red-600" : "text-slate-400"}>{lowDays} day{lowDays === 1 ? "" : "s"} below</span></div>
                {recorded.length === 0 && <div className="text-amber-600">no tests logged yet</div>}
              </div>
            </div>
          );
        })}
      </Card>
      <p className="mt-1 text-xs text-slate-400">
        From the in-app speed test on <Link href="/entry" className="underline hover:text-slate-600">Enter KPIs</Link>. Bars are the last {days.length} days (oldest → today). Hover a bar for that day&apos;s reading.
      </p>
    </section>
  );
}

function RoleScorecard({
  title,
  blurb,
  reps,
  kpis,
  dailyValues,
  targets,
  month,
}: {
  title: string;
  blurb: string;
  reps: User[];
  kpis: Kpi[];
  dailyValues: Map<string, number>;
  targets: Target[];
  month: string;
}) {
  return (
    <section>
      <SectionTitle title={title} subtitle={blurb} accent="bg-slate-300" right={<Legend />} />
      {reps.length === 0 ? (
        <Card className="p-6 text-slate-400">No one assigned to this role yet. Add them in Admin.</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {reps.map((rep) => {
            // Per-rep channel swap (Marie=Facebook, Sharyn=Instagram), then split into
            // the Money (results) + Activity (effort) boxes so it's not one long blob.
            const repKpis = kpis.filter((k) => !isKpiHiddenForRep(rep.name, k.key));
            const money = repKpis.filter((k) => k.category === "green");
            const activity = repKpis.filter((k) => k.category !== "green");
            const Row = (k: Kpi) => {
              const value = dailyValues.get(`${k.id}|${rep.id}`) ?? null;
              const goal = resolveGoalWith(targets, k, rep.id, month);
              const status: Status = value === null ? "none" : statusVsGoal(k.goalKind, value, goal);
              const cls = statusClasses(status);
              const bar = status === "hit" ? "bg-emerald-500" : status === "close" ? "bg-amber-500" : status === "miss" ? "bg-red-500" : "bg-slate-300";
              const pct = goal && goal > 0 && value !== null ? Math.min(100, (value / goal) * 100) : value !== null && value > 0 ? 100 : 0;
              return (
                <div key={k.id} className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-600"><KpiLabel kpiKey={k.key} name={k.name} /></span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className={`text-base font-extrabold ${cls.text}`}>{value === null ? "—" : formatValue(k.unit as Unit, value)}</span>
                      {goal !== null && <span className="text-xs text-slate-400"> / {formatValue(k.unit as Unit, goal)}</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            };
            return (
              <Card key={rep.id} className="overflow-hidden p-0">
                <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2 font-bold text-slate-800">{rep.name}</div>
                {money.length > 0 && (
                  <div>
                    <div className="bg-emerald-50/70 px-4 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">💰 Money — results</div>
                    <div className="divide-y divide-slate-100">{money.map(Row)}</div>
                  </div>
                )}
                {activity.length > 0 && (
                  <div>
                    <div className="border-t border-slate-100 bg-sky-50/70 px-4 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700">📊 Activity — effort</div>
                    <div className="divide-y divide-slate-100">{activity.map(Row)}</div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
