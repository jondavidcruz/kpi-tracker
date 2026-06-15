// Assembles the live "Monday Meeting" deck — mirrors the team's Canva all-call:
// last-week KPIs, month-to-date dashboard, active pipeline, annual goal,
// recognition, and a weakest-KPI training tip. Reuses the report/deal helpers.
import { db } from "./db";
import {
  getSettings, getActiveReps, getKpis, getRangeSums, getOpenDeals, getDealMetrics,
} from "./data";
import { lastWeekRange, monthBounds, friendlyDate } from "./date";
import { formatValue, type Unit } from "./format";
import { POSITIONS, positionLabel } from "./roles";
import { analyzeDeal } from "./deals";

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
    label: string; glance: Glance[];
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

export async function getMeetingDeck(today: string): Promise<MeetingDeck> {
  const wk = lastWeekRange(today);
  const mb = monthBounds(today);
  const year = today.slice(0, 4);

  const [settings, reps, perRepKpis, teamKpis, wkSums, mtdSums, deals, dealMetrics] = await Promise.all([
    getSettings(),
    getActiveReps(),
    getKpis({ scope: "per_rep", computed: false }),
    getKpis({ scope: "team", computed: false, cadence: "daily" }),
    getRangeSums(wk.start, wk.end),
    getRangeSums(mb.start, today),
    getOpenDeals(),
    getDealMetrics(year),
  ]);

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

  // ---- Annual goal ----
  const revenueGoal = settings.annualRevenueGoal ?? 0;
  const goalRemaining = Math.max(0, revenueGoal - dealMetrics.revenueClosed);

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
      glance: glanceFrom(teamKpis, perRepKpis, reps, mtdSums),
      revenueClosed: dealMetrics.revenueClosed,
      revenuePending: dealMetrics.revenuePendingEscrow,
      inEscrow: dealMetrics.inEscrowCount,
      closedCount: dealMetrics.closedCount,
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
      homeownersDone: dealMetrics.closedCount,
      homeownersGoal: settings.homeownersGoal ?? 24,
      revenueClosed: dealMetrics.revenueClosed,
      revenueGoal,
      stretchGoal: settings.revenueStretchGoal ?? 0,
      reward: settings.goalReward ?? "",
      stretchReward: settings.stretchReward ?? "",
      pct: revenueGoal > 0 ? Math.min(1, dealMetrics.revenueClosed / revenueGoal) : 0,
    },
    recognition,
    trainingTip,
  };
}
