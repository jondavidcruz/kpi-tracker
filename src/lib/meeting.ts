// Assembles the live "Monday Meeting" deck — mirrors the team's Canva all-call:
// last-week KPIs, month-to-date dashboard, active pipeline, annual goal,
// recognition, and a weakest-KPI training tip. Reuses the report/deal helpers.
import { db } from "./db";
import {
  getSettings, getActiveReps, getKpis, getRangeSums, getMonthlyValues, getOpenDeals, getDealMetrics,
} from "./data";
import { lastWeekRange, monthBounds, friendlyDate } from "./date";
import { formatValue, type Unit } from "./format";
import { POSITIONS, positionLabel } from "./roles";
import { analyzeDeal } from "./deals";
import { quarterOf, quarterLabel } from "./eos";

export interface Glance { key: string; name: string; value: string }
export interface RoleTable {
  label: string; emoji: string;
  columns: { key: string; name: string }[];
  rows: { rep: string; cells: string[] }[];
}
export interface Recognition { role: string; rep: string; kpi: string; value: string }
export interface PipelineRow { address: string; status: string; rep: string; days: number | null; profit: number | null }

export interface MeetingDeck {
  weekLabel: string;
  generatedOn: string;
  team: { name: string; role: string }[];
  announcements: string[];
  comingSoon: string[];
  talkingPoints: string[];
  lastWeek: { glance: Glance[]; roleTables: RoleTable[] };
  monthly: {
    label: string; financials: Glance[];
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

const ROLLUP_KEYS = ["appts_set", "appts_taken", "offers_made", "deals_sold", "new_buyers"];

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
    out.push({ key: k.key, name: k.name, value: formatValue(k.unit as Unit, sums.get(`${k.id}|`) ?? 0) });
  }
  for (const k of perRepKpis.filter((x) => ROLLUP_KEYS.includes(x.key) && x.category === "green")) {
    let total = 0; for (const r of reps) total += sums.get(`${k.id}|${r.id}`) ?? 0;
    out.push({ key: k.key, name: k.name, value: formatValue(k.unit as Unit, total) });
  }
  return out;
}

export interface LeadershipDeck {
  generatedOn: string;
  agenda: string[];
  talkingPoints: string[];
  actionItems: string[];
  goal: MeetingDeck["goal"];
  monthly: MeetingDeck["monthly"];
  pipelineCount: number;
}

/** Leadership-meeting deck — its own agenda/talking-points/action-items plus a
 *  high-level business snapshot (reuses the Monday deck's computed numbers). */
export async function getLeadershipDeck(today: string): Promise<LeadershipDeck> {
  const [deck, settings] = await Promise.all([getMeetingDeck(today), getSettings()]);
  return {
    generatedOn: deck.generatedOn,
    agenda: bullets(settings.leadAgenda ?? ""),
    talkingPoints: deck.talkingPoints,
    actionItems: bullets(settings.leadActionItems ?? ""),
    goal: deck.goal,
    monthly: deck.monthly,
    pipelineCount: deck.pipeline.length,
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

  const [settings, reps, perRepKpis, teamKpis, teamMonthlyKpis, wkSums, monthlyVals, deals, dealMetrics] = await Promise.all([
    getSettings(),
    getActiveReps(),
    getKpis({ scope: "per_rep", computed: false }),
    getKpis({ scope: "team", computed: false, cadence: "daily" }),
    getKpis({ scope: "team", computed: false, cadence: "monthly" }),
    getRangeSums(wk.start, wk.end),
    getMonthlyValues(today),
    getOpenDeals(),
    getDealMetrics(year),
  ]);

  // Month-to-date financial dashboard from the team's MONTHLY KPIs (contracts
  // sent/signed, deals closed, gross revenue, marketing spend, op-ex).
  const financials: Glance[] = teamMonthlyKpis.map((k) => ({
    key: k.key, name: k.name, value: formatValue(k.unit as Unit, monthlyVals.get(k.id) ?? 0),
  }));

  // ---- Last week: at-a-glance + per-role tables ----
  const lastGlance = glanceFrom(teamKpis, perRepKpis, reps, wkSums);
  const roleTables: RoleTable[] = [];
  for (const pos of POSITIONS) {
    const roleReps = reps.filter((r) => r.position === pos.key);
    const roleKpis = perRepKpis.filter((k) => k.roleKey === pos.key);
    if (!roleReps.length || !roleKpis.length) continue;
    roleTables.push({
      label: pos.label, emoji: pos.emoji,
      columns: roleKpis.map((k) => ({ key: k.key, name: k.name })),
      rows: roleReps.map((rep) => ({
        rep: rep.name,
        cells: roleKpis.map((k) => formatValue(k.unit as Unit, wkSums.get(`${k.id}|${rep.id}`) ?? 0)),
      })),
    });
  }

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

  return {
    weekLabel: wk.label,
    generatedOn: friendlyDate(today),
    team: reps.map((r) => ({ name: r.name, role: positionLabel(r.position) })),
    announcements: bullets(settings.mtgAnnouncements ?? ""),
    comingSoon: bullets(settings.mtgComingSoon ?? ""),
    talkingPoints: bullets(settings.mtgTalkingPoints ?? ""),
    lastWeek: { glance: lastGlance, roleTables },
    monthly: {
      label: friendlyDate(mb.start).replace(/,.*/, "") + " – today",
      financials,
      revenueClosed: closedRevenueYTD,
      revenuePending: dealMetrics.revenuePendingEscrow,
      inEscrow: dealMetrics.inEscrowCount,
      closedCount: homeownersDone,
      goalRemaining,
    },
    pipeline: deals.slice(0, 12).map((d) => ({
      address: d.address,
      status: d.status,
      rep: d.assignedTo || "—",
      days: analyzeDeal(d, today).days,
      profit: d.assignmentFee ?? null,
    })),
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
