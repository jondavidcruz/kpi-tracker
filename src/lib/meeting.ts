// Assembles the live "Monday Meeting" deck — mirrors the team's Canva all-call:
// last-week KPIs, month-to-date dashboard, active pipeline, annual goal,
// recognition, and a weakest-KPI training tip. Reuses the report/deal helpers.
import { db } from "./db";
import {
  getSettings, getActiveReps, getKpis, getRangeSums, getMonthlyValues, getOpenDeals, getDealMetrics,
} from "./data";
import { lastWeekRange, currentWeekRange, monthBounds, friendlyDate } from "./date";
import { formatValue, type Unit } from "./format";
import { POSITIONS, positionLabel } from "./roles";
import { analyzeDeal } from "./deals";
import { quarterOf, quarterLabel } from "./eos";
import { EXPENSE_CATEGORIES, LEAD_KPI_KEYS } from "./expenses";

export interface Glance { key: string; name: string; value: string }
export interface RoleTable {
  label: string; emoji: string;
  columns: { key: string; name: string }[];
  rows: { rep: string; cells: string[] }[];
}
export interface Recognition { role: string; rep: string; kpi: string; value: string }
export interface PipelineRow { address: string; status: string; rep: string; days: number | null; level: string; profit: number | null; contractPrice: number | null; askingPrice: number | null; nextSteps: string }

// A rotating, team-themed verse to close the Monday all-call on.
const TEAM_VERSES: { text: string; ref: string }[] = [
  { text: "Whatever you do, work heartily, as for the Lord and not for men.", ref: "Colossians 3:23" },
  { text: "Commit your work to the Lord, and your plans will be established.", ref: "Proverbs 16:3" },
  { text: "Two are better than one, because they have a good reward for their toil.", ref: "Ecclesiastes 4:9" },
  { text: "As iron sharpens iron, so one person sharpens another.", ref: "Proverbs 27:17" },
  { text: "Let us not grow weary of doing good, for in due season we will reap, if we do not give up.", ref: "Galatians 6:9" },
  { text: "Be strong and courageous… for the Lord your God is with you wherever you go.", ref: "Joshua 1:9" },
  { text: "Do you see a man skillful in his work? He will stand before kings.", ref: "Proverbs 22:29" },
  { text: "…always abounding in the work of the Lord, knowing that in the Lord your labor is not in vain.", ref: "1 Corinthians 15:58" },
  { text: "I can do all things through Christ who strengthens me.", ref: "Philippians 4:13" },
];

export interface CustomSlide { kind: string; title: string; body: string; imageUrl: string }
export interface MeetingDeck {
  weekLabel: string;
  thisWeekLabel: string;
  titleSlideUrl: string; // owner override for the hero slide (else built-in title.png)
  teamSlideUrl: string;  // owner override image for the team slide (else the native grid)
  customSlides: CustomSlide[]; // owner-added slides, inserted after the team slide
  verse: { text: string; ref: string };
  generatedOn: string;
  team: { name: string; role: string }[];
  announcements: string[];
  comingSoon: string[];
  talkingPoints: string[];
  lastWeek: { glance: Glance[]; roleTables: RoleTable[] };
  monthly: {
    label: string; financials: Glance[]; glance: Glance[]; roleTables: RoleTable[];
    revenueClosed: number; revenuePending: number; inEscrow: number; closedCount: number; goalRemaining: number;
  };
  pipeline: PipelineRow[];
  goal: {
    homeownersDone: number; homeownersGoal: number;
    revenueClosed: number; revenueGoal: number; stretchGoal: number;
    reward: string; stretchReward: string; pct: number;
  };
  recognition: Recognition[];
  trainingTip: { text: string; targetKpi: string } | null;
}

const ROLLUP_KEYS = ["offers_made", "acq_contracts_sent", "deals_sold", "new_buyers"];
const SIGNED_KEYS = ["acq_signed_assignment", "acq_signed_novation", "acq_signed_listing", "acq_signed_creative"];
// KPIs hidden from the meeting deck for now (per Jon).
const EXCLUDE_KPIS = new Set(["text_responses", "appts_set", "appts_taken"]);
// The Monday deck shows only the CORE MONEY KPIs per role (the full scorecard is too
// much to read on a slide). Order = display order. Roles not listed show everything.
const CORE_DECK_KPIS: Record<string, string[]> = {
  acquisitions: ["offers_made", "acq_contracts_sent", "acq_signed_assignment", "acq_signed_novation", "acq_signed_creative"],
  // Lead with developer-sourcing output: Buyers Vetted + Buy Boxes Captured (auto-tracked
  // from Buyer Research) — the developers they vetted/added — then the deal-flow money KPIs.
  // (new_buyers was retired in the Jul '26 dispo rework, which is why the table looked short.)
  dispositions: ["buyers_vetted", "buy_boxes_captured", "deals_sold", "buyer_offers_received", "contracts_assigned"],
};
// The month's core money KPIs (entered monthly, so not in the daily-summed glance).
const CORE_MONTHLY_KPIS = ["ppl_leads", "gross_revenue", "marketing_spend", "deals_closed"];

// Per-position KPI tables for a given sums map (last week or month-to-date).
function buildRoleTables(
  reps: { id: string; name: string; position: string }[],
  perRepKpis: { id: string; key: string; name: string; unit: string; roleKey: string }[],
  sums: Map<string, number>,
): RoleTable[] {
  const tables: RoleTable[] = [];
  for (const pos of POSITIONS) {
    const roleReps = reps.filter((r) => r.position === pos.key);
    const available = perRepKpis.filter((k) => k.roleKey === pos.key && !EXCLUDE_KPIS.has(k.key));
    const core = CORE_DECK_KPIS[pos.key];
    // Only the core money KPIs (in the given order); fall back to all for unlisted roles.
    const roleKpis = core
      ? core.map((key) => available.find((k) => k.key === key)).filter((k): k is (typeof available)[number] => !!k)
      : available;
    if (!roleReps.length || !roleKpis.length) continue;
    tables.push({
      label: pos.label, emoji: pos.emoji,
      columns: roleKpis.map((k) => ({ key: k.key, name: k.name })),
      rows: roleReps.map((rep) => ({ rep: rep.name, cells: roleKpis.map((k) => formatValue(k.unit as Unit, sums.get(`${k.id}|${rep.id}`) ?? 0)) })),
    });
  }
  return tables;
}

function bullets(s: string): string[] {
  return s.split("\n").map((l) => l.replace(/^[-•\s]+/, "").trim()).filter(Boolean);
}
function hashWeek(s: string): number {
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h;
}

function glanceFrom(
  teamKpis: { id: string; key: string; name: string; unit: string }[],
  perRepKpis: { id: string; key: string; name: string; unit: string; category: string }[],
  reps: { id: string }[],
  sums: Map<string, number>,
): Glance[] {
  const out: Glance[] = [];
  for (const k of teamKpis) {
    if (EXCLUDE_KPIS.has(k.key)) continue;
    out.push({ key: k.key, name: k.name, value: formatValue(k.unit as Unit, sums.get(`${k.id}|`) ?? 0) });
  }
  for (const k of perRepKpis.filter((x) => ROLLUP_KEYS.includes(x.key) && x.category === "green")) {
    let total = 0; for (const r of reps) total += sums.get(`${k.id}|${r.id}`) ?? 0;
    out.push({ key: k.key, name: k.name, value: formatValue(k.unit as Unit, total) });
  }
  // "Contracts Signed (after verbal)" — combine the four signed-contract types.
  const signedKpis = perRepKpis.filter((k) => SIGNED_KEYS.includes(k.key));
  if (signedKpis.length) {
    let total = 0;
    for (const k of signedKpis) for (const r of reps) total += sums.get(`${k.id}|${r.id}`) ?? 0;
    out.push({ key: "contracts_signed_total", name: "Contracts Signed", value: formatValue("count", total) });
  }
  return out;
}

export interface FinanceSnapshot {
  monthLabel: string;
  income: number; spent: number; profit: number; margin: number | null;
  categories: { label: string; total: number; color: string }[];
  leads: number; costPerLead: number;
}

export interface LeadershipDeck {
  generatedOn: string;
  agenda: string[];
  talkingPoints: string[];
  actionItems: string[];
  goal: MeetingDeck["goal"];
  monthly: MeetingDeck["monthly"];
  pipelineCount: number;
  finance: FinanceSnapshot | null;
}

/** Leadership-meeting deck — its own agenda/talking-points/action-items plus a
 *  high-level business snapshot. When the viewer is C-suite, the snapshot syncs
 *  live from the Profit & Loss report (costs + leads). */
export async function getLeadershipDeck(today: string, cSuite = false): Promise<LeadershipDeck> {
  const [deck, settings] = await Promise.all([getMeetingDeck(today), getSettings()]);

  let finance: FinanceSnapshot | null = null;
  if (cSuite) {
    const monthRow = await db.expenseLine.findFirst({ orderBy: { month: "desc" }, select: { month: true } });
    if (monthRow) {
      const m = monthRow.month;
      const [lines, meta, leadKpis] = await Promise.all([
        db.expenseLine.findMany({ where: { month: m } }),
        db.expenseMonth.findUnique({ where: { month: m } }),
        db.kpi.findMany({ where: { key: { in: LEAD_KPI_KEYS } }, select: { id: true } }),
      ]);
      const spent = lines.reduce((s, l) => s + l.actual, 0);
      const income = meta?.netSales ?? 0;
      const leadEntries = leadKpis.length
        ? await db.entry.findMany({ where: { kpiId: { in: leadKpis.map((k) => k.id) }, date: { gte: `${m}-01`, lte: `${m}-31` } }, select: { value: true } })
        : [];
      const leads = leadEntries.reduce((s, e) => s + e.value, 0);
      const categories = EXPENSE_CATEGORIES
        .map((c) => ({ label: c.label, color: c.color, total: lines.filter((l) => l.category === c.key).reduce((s, l) => s + l.actual, 0) }))
        .filter((c) => c.total > 0);
      finance = {
        monthLabel: new Date(m + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
        income, spent, profit: income - spent, margin: income > 0 ? ((income - spent) / income) * 100 : null,
        categories, leads, costPerLead: leads > 0 ? spent / leads : 0,
      };
    }
  }

  return {
    generatedOn: deck.generatedOn,
    agenda: bullets(settings.leadAgenda ?? ""),
    talkingPoints: deck.talkingPoints,
    actionItems: bullets(settings.leadActionItems ?? ""),
    goal: deck.goal,
    monthly: deck.monthly,
    pipelineCount: deck.pipeline.length,
    finance,
  };
}

export interface L10 {
  generatedOn: string;
  quarterLabel: string;
  scorecard: Glance[];
  rocks: {
    total: number; onTrack: number; offTrack: number; done: number;
    list: { title: string; owner: string; status: string; progress: number; isCompany: boolean }[];
  };
  issues: { title: string; raisedBy: string; owner: string }[];
  todos: { open: number; donePct: number; list: { text: string; owner: string; dueDate: string }[] };
  goal: MeetingDeck["goal"];
}

/** Level 10 Meeting data — reuses the Monday deck's weekly scorecard + goal, and
 *  pulls live Rocks, Issues, and To-Dos for the IDS engine. */
export async function getL10(today: string): Promise<L10> {
  const deck = await getMeetingDeck(today);
  const quarter = quarterOf(today);
  const [rocks, issues, todos] = await Promise.all([
    db.rock.findMany({ where: { quarter }, orderBy: [{ isCompany: "desc" }, { createdAt: "asc" }] }),
    db.issue.findMany({ where: { status: "open" }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: 8 }),
    db.toDo.findMany({ orderBy: [{ done: "asc" }, { dueDate: "asc" }] }),
  ]);
  const doneTodos = todos.filter((t) => t.done).length;
  return {
    generatedOn: deck.generatedOn,
    quarterLabel: quarterLabel(quarter),
    scorecard: deck.lastWeek.glance,
    rocks: {
      total: rocks.length,
      onTrack: rocks.filter((r) => r.status === "on_track").length,
      offTrack: rocks.filter((r) => r.status === "off_track").length,
      done: rocks.filter((r) => r.status === "done").length,
      list: rocks.map((r) => ({ title: r.title, owner: r.isCompany ? "Company" : (r.owner || "—"), status: r.status, progress: r.progress, isCompany: r.isCompany })),
    },
    issues: issues.map((i) => ({ title: i.title, raisedBy: i.raisedBy, owner: i.owner })),
    todos: {
      open: todos.filter((t) => !t.done).length,
      donePct: todos.length ? Math.round((doneTodos / todos.length) * 100) : 0,
      list: todos.filter((t) => !t.done).slice(0, 10).map((t) => ({ text: t.text, owner: t.owner, dueDate: t.dueDate })),
    },
    goal: deck.goal,
  };
}

export async function getMeetingDeck(today: string): Promise<MeetingDeck> {
  const wk = lastWeekRange(today);
  const mb = monthBounds(today);
  const year = today.slice(0, 4);

  const [settings, reps, perRepKpis, teamKpis, teamMonthlyKpis, wkSums, monthlyVals, deals, dealMetrics, customSlideRows] = await Promise.all([
    getSettings(),
    getActiveReps(),
    getKpis({ scope: "per_rep", computed: false }),
    getKpis({ scope: "team", computed: false, cadence: "daily" }),
    getKpis({ scope: "team", computed: false, cadence: "monthly" }),
    getRangeSums(wk.start, wk.end),
    getMonthlyValues(today),
    getOpenDeals(),
    getDealMetrics(year),
    db.deckSlide.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  // Month-to-date financial dashboard from the team's MONTHLY KPIs (contracts
  // sent/signed, deals closed, gross revenue, marketing spend, op-ex).
  const financials: Glance[] = teamMonthlyKpis.map((k) => ({
    key: k.key, name: k.name, value: formatValue(k.unit as Unit, monthlyVals.get(k.id) ?? 0),
  }));

  // ---- Last week: at-a-glance + per-role tables ----
  const lastGlance = glanceFrom(teamKpis, perRepKpis, reps, wkSums);
  const roleTables = buildRoleTables(reps, perRepKpis, wkSums);

  // ---- Month-to-date: same KPI breakdown, summed across the whole month ----
  const monthSums = await getRangeSums(mb.start, today);
  const monthGlance = glanceFrom(teamKpis, perRepKpis, reps, monthSums);
  const monthRoleTables = buildRoleTables(reps, perRepKpis, monthSums);
  // Lead with the month's core money KPIs (PPL leads, revenue, spend, closes) — these are
  // entered monthly so they weren't in the daily-summed glance; that's why they showed blank.
  const coreMonthly = CORE_MONTHLY_KPIS.map((key) => financials.find((f) => f.key === key)).filter((f): f is Glance => !!f);
  const monthDeckGlance = [...coreMonthly, ...monthGlance];

  // ---- Annual goal — synced from the Closed Deals ledger (this year). Every
  // closed deal = one homeowner helped; revenue = sum of verified profit. ----
  const closedThisYear = await db.closedDeal.findMany({ where: { year: Number(year) } });
  const homeownersDone = closedThisYear.length;
  const closedRevenueYTD = closedThisYear.reduce((s, d) => s + d.profit, 0);
  const revenueGoal = settings.annualRevenueGoal ?? 0;
  const goalRemaining = Math.max(0, revenueGoal - closedRevenueYTD);

  // ---- Recognition: top performer per role on a signature KPI ----
  const byKey = new Map(perRepKpis.map((k) => [k.key, k]));
  const SIGNATURE: Record<string, string[]> = {
    acquisitions: ["offers_made", "appts_taken", "deals_sold"],
    dispositions: ["new_buyers", "deals_sent", "buyers_contacted"],
  };
  const recognition: Recognition[] = [];
  for (const pos of POSITIONS) {
    const roleReps = reps.filter((r) => r.position === pos.key);
    const sigKey = (SIGNATURE[pos.key] ?? []).find((k) => byKey.has(k));
    const k = sigKey ? byKey.get(sigKey)! : null;
    if (!k || !roleReps.length) continue;
    let best: { rep: string; val: number } | null = null;
    for (const r of roleReps) {
      const v = wkSums.get(`${k.id}|${r.id}`) ?? 0;
      if (v > 0 && (!best || v > best.val)) best = { rep: r.name, val: v };
    }
    if (best) recognition.push({ role: pos.label, rep: best.rep, kpi: k.name, value: formatValue(k.unit as Unit, best.val) });
  }

  // ---- Weakest KPI → training tip ----
  let weakest: { key: string; name: string; attain: number } | null = null;
  for (const k of perRepKpis) {
    if (k.category !== "green" || k.goalKind !== "at_least" || !k.goalValue) continue;
    const roleReps = reps.filter((r) => r.position === k.roleKey);
    if (!roleReps.length) continue;
    let total = 0; for (const r of roleReps) total += wkSums.get(`${k.id}|${r.id}`) ?? 0;
    const expected = k.goalValue * roleReps.length * 5; // daily goal × reps × workdays
    if (expected <= 0) continue;
    const attain = total / expected;
    if (!weakest || attain < weakest.attain) weakest = { key: k.key, name: k.name, attain };
  }
  const tips = await db.trainingTip.findMany({ where: { active: true } });
  const pickTip = (pool: typeof tips) => (pool.length ? pool[hashWeek(wk.start) % pool.length] : null);
  const targeted = weakest ? tips.filter((t) => t.kpiKey === weakest!.key) : [];
  const chosen = pickTip(targeted.length ? targeted : tips.filter((t) => !t.kpiKey));
  const trainingTip = chosen
    ? { text: chosen.text, targetKpi: weakest && targeted.length ? weakest.name : "" }
    : null;

  const thisWeek = currentWeekRange(today);
  return {
    weekLabel: wk.label,
    thisWeekLabel: thisWeek.label,
    titleSlideUrl: settings.titleSlideUrl ?? "",
    teamSlideUrl: settings.teamSlideUrl ?? "",
    customSlides: customSlideRows.map((s) => ({ kind: s.kind, title: s.title, body: s.body, imageUrl: s.imageUrl })),
    verse: TEAM_VERSES[hashWeek(thisWeek.start) % TEAM_VERSES.length],
    generatedOn: friendlyDate(today),
    team: reps.map((r) => ({ name: r.name, role: positionLabel(r.position) })),
    announcements: bullets(settings.mtgAnnouncements ?? ""),
    comingSoon: bullets(settings.mtgComingSoon ?? ""),
    talkingPoints: bullets(settings.mtgTalkingPoints ?? ""),
    lastWeek: { glance: lastGlance, roleTables },
    monthly: {
      label: friendlyDate(mb.start).replace(/,.*/, "") + " – today",
      financials, glance: monthDeckGlance, roleTables: monthRoleTables,
      revenueClosed: closedRevenueYTD,
      revenuePending: dealMetrics.revenuePendingEscrow,
      inEscrow: dealMetrics.inEscrowCount,
      closedCount: homeownersDone,
      goalRemaining,
    },
    pipeline: deals.slice(0, 12).map((d) => {
      const a = analyzeDeal(d, today);
      return {
        address: d.address,
        status: d.status,
        rep: d.assignedTo || "—",
        days: a.days,
        level: a.level,
        profit: d.assignmentFee ?? null,
        contractPrice: d.contractPrice ?? null,
        askingPrice: d.askingPrice ?? null,
        nextSteps: d.nextSteps || (a.level !== "fresh" ? a.recommendation : ""),
      };
    }),
    goal: {
      homeownersDone,
      homeownersGoal: settings.homeownersGoal ?? 24,
      revenueClosed: closedRevenueYTD,
      revenueGoal,
      stretchGoal: settings.revenueStretchGoal ?? 0,
      reward: settings.goalReward ?? "",
      stretchReward: settings.stretchReward ?? "",
      pct: revenueGoal > 0 ? Math.min(1, closedRevenueYTD / revenueGoal) : 0,
    },
    recognition,
    trainingTip,
  };
}

// ── Auto talking-points summary ──────────────────────────────────────────────
// A consistent, same-structure-every-week briefing of what to talk about,
// generated from the week's data. Separate from the KPI sheets.
export interface MeetingSummary {
  weekLabel: string;
  wins: string[];
  numbers: string[];
  attention: string[];
  pipeline: string[];
  focus: string[];
  shoutouts: string[];
}

const SUMMARY_KPIS: { keys: string[]; label: string }[] = [
  { keys: ["ppl_leads", "text_responses", "direct_mail_responses"], label: "Leads" },
  { keys: ["appts_set", "appts_taken"], label: "Appointments" },
  { keys: ["offers_made"], label: "Offers" },
  { keys: ["acq_contracts_sent"], label: "Contracts sent" },
  { keys: ["acq_signed_assignment", "acq_signed_novation", "acq_signed_listing", "acq_signed_creative"], label: "Contracts signed" },
  { keys: ["new_buyers"], label: "New buyers" },
];

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

export async function buildMeetingSummary(today: string, deck: MeetingDeck): Promise<MeetingSummary> {
  const thisW = lastWeekRange(today); // the just-finished week
  const prior = lastWeekRange(thisW.start); // the week before that
  const [sumsThis, sumsPrior, kpis, pips] = await Promise.all([
    getRangeSums(thisW.start, thisW.end),
    getRangeSums(prior.start, prior.end),
    getKpis({ computed: false }),
    db.pip.findMany({ where: { status: "open" }, include: { user: { select: { name: true } } } }),
  ]);
  const idByKey = new Map(kpis.map((k) => [k.key, k.id]));
  const sumKeys = (sums: Map<string, number>, keys: string[]) => {
    let total = 0;
    for (const key of keys) { const id = idByKey.get(key); if (!id) continue; for (const [k, v] of sums) if (k.startsWith(id + "|")) total += v; }
    return total;
  };

  const numbers: string[] = [];
  const attention: string[] = [];
  for (const s of SUMMARY_KPIS) {
    const a = sumKeys(sumsThis, s.keys), b = sumKeys(sumsPrior, s.keys);
    if (a === 0 && b === 0) continue;
    const arrow = a > b ? "▲" : a < b ? "▼" : "▬";
    numbers.push(`${arrow} ${s.label}: ${Math.round(a)} (was ${Math.round(b)})`);
    if (a < b) attention.push(`${s.label} dropped to ${Math.round(a)} from ${Math.round(b)} — dig into why.`);
  }

  const wins: string[] = [];
  for (const r of deck.recognition.slice(0, 3)) wins.push(`🏆 ${r.rep} led ${r.role} — ${r.kpi} ${r.value}`);
  if (deck.monthly.closedCount > 0) wins.push(`Closed ${deck.monthly.closedCount} deal${deck.monthly.closedCount > 1 ? "s" : ""} for ${usd(deck.monthly.revenueClosed)} so far this month.`);
  if (wins.length === 0) wins.push("Set the tone — call out one thing the team did well last week.");

  const pipeline: string[] = [];
  if (deck.monthly.inEscrow > 0) pipeline.push(`${usd(deck.monthly.inEscrow)} in escrow / pending.`);
  const closingSoon = deck.pipeline.filter((p) => p.days != null && p.days < 21).slice(0, 4);
  for (const p of closingSoon) pipeline.push(`${p.address} — ${p.status}${p.days != null ? ` (${p.days}d)` : ""}`);
  const stale = deck.pipeline.filter((p) => p.days != null && p.days >= 30).slice(0, 4);
  for (const p of stale) attention.push(`${p.address} stale at ${p.days}d — price reduction or switch buyers.`);
  if (pipeline.length === 0) pipeline.push("Walk the active pipeline — what's closest to closing?");

  const focus: string[] = [];
  if (deck.trainingTip) focus.push(`Skill focus: ${deck.trainingTip.text}`);
  if (deck.goal.revenueGoal > 0) focus.push(`Goal: ${usd(deck.goal.revenueClosed)} of ${usd(deck.goal.revenueGoal)} (${deck.goal.pct}%) — keep the board moving.`);
  if (focus.length === 0) focus.push("Pick one number to move this week and make it the rallying point.");

  const shoutouts: string[] = [];
  for (const p of pips) shoutouts.push(`🟠 ${p.user?.name ?? "—"} on a PIP (${p.kpiName || p.kpiKey}) → works Saturday.`);

  return { weekLabel: thisW.label, wins, numbers, attention, pipeline, focus, shoutouts };
}
