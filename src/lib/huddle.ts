import { db } from "./db";
import { analyzeDeal } from "./deals";
import type { Deal } from "@prisma/client";

export type HuddleMiss = { userId: string | null; name: string; kpi: string; expected: number; actual: number; repReason: string; fix: string };
export type HuddleCheckItem = { id: string; text: string; done: boolean };
export type HuddleRep = {
  id: string; name: string; position: string; role: "Acquisitions" | "Dispositions" | "Team";
  goal: string; pending: string; note: string; submitted: boolean;
  goals: HuddleCheckItem[]; pendings: HuddleCheckItem[];
  items: { id: string; title: string; status: string; roadblock: string; nextStep: string; todayAction: string; hot: boolean }[];
  deals: { deal: Deal; days: number | null; level: string; recommendation: string }[];
  tasks: { id: string; text: string; assignedBy: string; done: boolean }[];
  eodHit: string; eodNote: string; eodFollowup: string;
  yesterdayFollowup: string; yesterdayHit: string;
};
export type HuddleData = {
  date: string;
  prev: string;
  misses: HuddleMiss[];
  pips: { name: string; kpiName: string }[];
  reps: HuddleRep[];
  dealRollup: { deal: Deal; days: number | null; level: string; recommendation: string }[];
};

/** Previous Mon–Fri working day before `dateStr`. */
export function prevWorkday(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  do { dt.setUTCDate(dt.getUTCDate() - 1); } while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6);
  return dt.toISOString().slice(0, 10);
}

const firstName = (n: string) => n.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
const roleOf = (position: string): HuddleRep["role"] =>
  position === "dispositions" ? "Dispositions" : position === "acquisitions" || position === "cc_lm" ? "Acquisitions" : "Team";

export async function buildHuddleData(date: string, opts?: { carry?: boolean }): Promise<HuddleData> {
  const prev = prevWorkday(date);
  const taskSince = new Date(Date.now() - 7 * 86400000);

  // Auto-carry: anything from yesterday that wasn't accomplished (an undone goal
  // OR an undone pending) rolls into today's "Pending from yesterday" so nothing
  // slips. Idempotent — dedupes by text, only runs on the live (today) view.
  if (opts?.carry) {
    const prevUndone = await db.huddleCheck.findMany({ where: { date: prev, done: false } });
    if (prevUndone.length) {
      const todayPending = await db.huddleCheck.findMany({ where: { date, kind: "pending" }, select: { userId: true, text: true } });
      const have = new Set(todayPending.map((c) => `${c.userId}|${c.text.trim().toLowerCase()}`));
      const toCreate = prevUndone
        .filter((c) => c.text.trim() && !have.has(`${c.userId}|${c.text.trim().toLowerCase()}`))
        .map((c) => ({ userId: c.userId, date, kind: "pending", text: c.text }));
      if (toCreate.length) await db.huddleCheck.createMany({ data: toCreate });
    }
  }

  const [users, alerts, pips, standups, deals, huddleTasks] = await Promise.all([
    db.user.findMany({ where: { active: true, position: { not: "" } }, orderBy: { name: "asc" }, select: { id: true, name: true, position: true } }),
    db.alert.findMany({ where: { date: prev }, include: { kpi: { select: { name: true } }, user: { select: { name: true } } } }),
    db.pip.findMany({ where: { status: "open" }, include: { user: { select: { name: true } } } }),
    db.standup.findMany({ where: { date }, include: { items: { orderBy: { createdAt: "asc" } } } }),
    db.deal.findMany({ where: { status: { notIn: ["closed", "dead", "lost"] } } }),
    db.huddleTask.findMany({ where: { OR: [{ done: false }, { doneAt: { gte: taskSince } }] }, orderBy: { createdAt: "asc" } }),
  ]);
  const checks = await db.huddleCheck.findMany({ where: { date }, orderBy: { sortOrder: "asc" } });
  const checksByUser = new Map<string, typeof checks>();
  for (const c of checks) { const a = checksByUser.get(c.userId) ?? []; a.push(c); checksByUser.set(c.userId, a); }
  const prevStandups = await db.standup.findMany({ where: { date: prev }, select: { userId: true, eodFollowup: true, eodHit: true } });
  const prevByUser = new Map(prevStandups.map((s) => [s.userId, s]));

  const misses: HuddleMiss[] = alerts.map((a) => ({
    userId: a.userId, name: a.user?.name ?? "Team", kpi: a.kpi?.name ?? "KPI",
    expected: a.expected, actual: a.actual, repReason: a.repReason ?? "", fix: a.correctiveAction ?? "",
  }));
  const pipNames = pips.map((p) => ({ name: p.user?.name ?? "—", kpiName: p.kpiName || p.kpiKey }));
  const standupByUser = new Map(standups.map((s) => [s.userId, s]));
  const tasksByUser = new Map<string, typeof huddleTasks>();
  for (const t of huddleTasks) { const a = tasksByUser.get(t.userId) ?? []; a.push(t); tasksByUser.set(t.userId, a); }
  const dealAging = deals.map((deal) => { const a = analyzeDeal(deal, date); return { deal, days: a.days, level: a.level, recommendation: a.recommendation }; });

  const owners = users.filter((u) => firstName(u.name) === "jon");
  const reps: HuddleRep[] = users.filter((u) => !owners.includes(u)).map((u) => {
    const s = standupByUser.get(u.id);
    const role = roleOf(u.position);
    return {
      id: u.id, name: u.name, position: u.position, role,
      goal: s?.goal ?? "", pending: s?.pending ?? "", note: s?.note ?? "", submitted: s?.submitted ?? false,
      goals: (checksByUser.get(u.id) ?? []).filter((c) => c.kind === "goal").map((c) => ({ id: c.id, text: c.text, done: c.done })),
      pendings: (checksByUser.get(u.id) ?? []).filter((c) => c.kind === "pending").map((c) => ({ id: c.id, text: c.text, done: c.done })),
      items: (s?.items ?? []).map((it) => ({ id: it.id, title: it.title, status: it.status, roadblock: it.roadblock, nextStep: it.nextStep, todayAction: it.todayAction, hot: it.hot })),
      deals: role === "Dispositions" ? dealAging.filter((d) => firstName(d.deal.assignedTo) === firstName(u.name)) : [],
      tasks: (tasksByUser.get(u.id) ?? []).map((t) => ({ id: t.id, text: t.text, assignedBy: t.assignedBy, done: t.done })),
      eodHit: s?.eodHit ?? "", eodNote: s?.eodNote ?? "", eodFollowup: s?.eodFollowup ?? "",
      yesterdayFollowup: prevByUser.get(u.id)?.eodFollowup ?? "", yesterdayHit: prevByUser.get(u.id)?.eodHit ?? "",
    };
  });

  return { date, prev, misses, pips: pipNames, reps, dealRollup: dealAging };
}
