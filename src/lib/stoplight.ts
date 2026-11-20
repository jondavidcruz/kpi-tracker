// Weekly Stoplight Check (EOS-style) — every team member reports 🟢/🟡/🔴 for
// their week before the Monday all-call. Due Friday end of day; a Friday-afternoon
// Team Chat nudge names whoever hasn't reported. Shown on the Monday deck.
//
// Stored in the Resource table under a reserved category (no migration):
//   category = STOPLIGHT_CAT, title = "<weekStart>|<userId>", url = color,
//   description = JSON StoplightData.
// Yellow/red auto-raise a team Issue (IDS) so it gets solved in the meeting.
import { db } from "./db";
import { getActiveReps, getKpis, getRangeSums, getAllTargets, resolveGoalWith } from "./data";
import { currentWeekRange, lastWeekRange, monthOf } from "./date";
import { isKpiHiddenForRep } from "./kpi";
import { isOwner } from "./auth";
import { POSITIONS } from "./roles";

export const STOPLIGHT_CAT = "__stoplight__";
export type Light = "green" | "yellow" | "red";
export const LIGHTS: Light[] = ["green", "yellow", "red"];

export const LIGHT_META: Record<Light, { emoji: string; label: string; meaning: string; prompt: string }> = {
  green: { emoji: "🟢", label: "Green", meaning: "Everything is good — on track to deliver.", prompt: "" },
  yellow: { emoji: "🟡", label: "Yellow", meaning: "Something's not working — we need help fixing it.", prompt: "What's not working, and what help do you need?" },
  red: { emoji: "🔴", label: "Red", meaning: "Stop — a change is needed.", prompt: "What needs to change, and who needs to own it?" },
};

export interface StoplightData {
  name: string;
  // Jon 2026-11-20: a note PER colour (fill any/all, like a real stoplight). Overall
  // colour = worst one with content (red > yellow > green).
  greenNote: string;   // what's on track / going well
  yellowNote: string;  // what's not working + help needed
  redNote: string;     // what needs to stop/change + who owns it
  note: string;        // (compat) the worst-colour note — kept for the Monday deck
  greenWhy: string;    // (compat) = greenNote
  onPace: number;      // KPI context captured at submit time
  paceTotal: number;
  at: string;          // ISO submitted
  issueId: string;     // auto-raised Issue for yellow/red
}

export interface StoplightReport extends StoplightData { userId: string; color: Light }

/** Week a report being FILED today belongs to. Monday morning stragglers still
 *  count toward the week just finished (the one the meeting reviews). */
export function reportWeek(today: string): { start: string; label: string } {
  const dow = new Date(today + "T12:00:00Z").getUTCDay();
  const w = dow === 1 ? lastWeekRange(today) : currentWeekRange(today);
  return { start: w.start, label: w.label };
}

/** Week the Monday DECK shows: Mon–Thu → the week just reviewed; Fri–Sun →
 *  this week's reports (prep for the upcoming meeting). */
export function deckWeek(today: string): { start: string; label: string } {
  const dow = new Date(today + "T12:00:00Z").getUTCDay();
  const w = dow >= 1 && dow <= 4 ? lastWeekRange(today) : currentWeekRange(today);
  return { start: w.start, label: w.label };
}

function parse(row: { title: string; url: string; description: string }): StoplightReport | null {
  const color = row.url as Light;
  if (!LIGHTS.includes(color)) return null;
  let d: Partial<StoplightData> = {};
  try { d = JSON.parse(row.description || "{}"); } catch { /* keep defaults */ }
  // Back-compat: old reports stored one `note` for the chosen colour + `greenWhy`.
  const greenNote = d.greenNote ?? d.greenWhy ?? "";
  const yellowNote = d.yellowNote ?? (color === "yellow" ? (d.note ?? "") : "");
  const redNote = d.redNote ?? (color === "red" ? (d.note ?? "") : "");
  return {
    userId: row.title.split("|")[1] ?? "",
    color,
    name: d.name ?? "",
    greenNote, yellowNote, redNote,
    note: d.note ?? (color === "red" ? redNote : color === "yellow" ? yellowNote : ""),
    greenWhy: d.greenWhy ?? greenNote,
    onPace: d.onPace ?? 0,
    paceTotal: d.paceTotal ?? 0,
    at: d.at ?? "",
    issueId: d.issueId ?? "",
  };
}

export async function getWeekReports(weekStart: string): Promise<Map<string, StoplightReport>> {
  const rows = await db.resource.findMany({ where: { category: STOPLIGHT_CAT, title: { startsWith: `${weekStart}|` } } });
  const out = new Map<string, StoplightReport>();
  for (const r of rows) { const p = parse(r); if (p) out.set(p.userId, p); }
  return out;
}

/** Everyone expected to report: active team members with a position (the owner
 *  and anyone still in the onboarding ramp excluded — they can't open /stoplight). */
export async function getReporters() {
  const reps = await getActiveReps();
  return reps.filter((r) => !isOwner(r) && !r.onboarding);
}

/** KPI context for the picker: how many of the rep's daily goal KPIs are on pace
 *  for the week so far (goal × workdays elapsed, Mon → min(today, Fri)). */
export async function kpiPace(user: { id: string; name: string; position: string }, weekStart: string, today: string): Promise<{ onPace: number; total: number; behind: string[] }> {
  const weekEnd = new Date(Date.parse(weekStart + "T12:00:00Z") + 4 * 86400000).toISOString().slice(0, 10);
  const end = today < weekEnd ? today : weekEnd;
  if (end < weekStart) return { onPace: 0, total: 0, behind: [] };
  let workdays = 0;
  for (let t = Date.parse(weekStart + "T12:00:00Z"); t <= Date.parse(end + "T12:00:00Z"); t += 86400000) {
    const w = new Date(t).getUTCDay(); if (w >= 1 && w <= 5) workdays++;
  }
  const [kpis, sums, targets] = await Promise.all([
    getKpis({ scope: "per_rep", computed: false, roleKey: user.position }),
    getRangeSums(weekStart, end),
    getAllTargets(),
  ]);
  let onPace = 0, total = 0; const behind: string[] = [];
  for (const k of kpis) {
    if (k.category !== "green" || k.goalKind !== "at_least" || k.cadence !== "daily") continue;
    if (isKpiHiddenForRep(user.name, k.key)) continue;
    const goal = resolveGoalWith(targets, k, user.id, monthOf(weekStart)) ?? 0;
    if (goal <= 0) continue;
    total++;
    if ((sums.get(`${k.id}|${user.id}`) ?? 0) >= goal * workdays) onPace++; else behind.push(k.name);
  }
  return { onPace, total, behind };
}

/** Save (or replace) a user's report for the week; syncs the auto-raised Issue. */
export async function saveReport(
  user: { id: string; name: string },
  weekStart: string, weekLabel: string,
  data: { greenNote: string; yellowNote: string; redNote: string; onPace: number; paceTotal: number },
): Promise<Light> {
  const greenNote = (data.greenNote || "").trim();
  const yellowNote = (data.yellowNote || "").trim();
  const redNote = (data.redNote || "").trim();
  // Overall colour = the worst thing reported (a red beats a yellow beats all-green).
  const color: Light = redNote ? "red" : yellowNote ? "yellow" : "green";
  const title = `${weekStart}|${user.id}`;
  const existing = await db.resource.findFirst({ where: { category: STOPLIGHT_CAT, title } });
  const prev = existing ? parse(existing) : null;
  let issueId = prev?.issueId ?? "";

  // The concern(s) that become the auto-raised team Issue — red first, then yellow.
  const issueBody = [redNote && `🔴 ${redNote}`, yellowNote && `🟡 ${yellowNote}`].filter(Boolean).join("\n");

  if (color === "green") {
    // All-green (no yellow/red concerns) → drop the auto-raised issue if nobody has worked it yet.
    if (issueId) await db.issue.updateMany({ where: { id: issueId, status: "open" }, data: { status: "dropped", solveNote: "Stoplight changed to green" } });
  } else {
    const first = user.name.split(" ")[0];
    const issueTitle = `${LIGHT_META[color].emoji} ${first}: ${redNote || yellowNote}`.slice(0, 140);
    const detail = `Stoplight check — week of ${weekLabel}.\n\n${issueBody}`;
    const reuse = issueId ? await db.issue.findUnique({ where: { id: issueId } }) : null;
    if (reuse) {
      await db.issue.update({ where: { id: issueId }, data: { title: issueTitle, detail, status: reuse.status === "dropped" ? "open" : reuse.status, priority: color === "red" ? Math.max(reuse.priority, 1) : reuse.priority } });
    } else {
      const created = await db.issue.create({ data: { title: issueTitle, detail, scope: "team", raisedBy: user.name, priority: color === "red" ? 1 : 0 } });
      issueId = created.id;
    }
  }

  const payload: StoplightData = {
    name: user.name, greenNote, yellowNote, redNote,
    note: color === "green" ? "" : (color === "red" ? redNote : yellowNote),
    greenWhy: greenNote,
    onPace: data.onPace, paceTotal: data.paceTotal, at: new Date().toISOString(), issueId,
  };
  if (existing) {
    await db.resource.update({ where: { id: existing.id }, data: { url: color, description: JSON.stringify(payload) } });
  } else {
    await db.resource.create({ data: { category: STOPLIGHT_CAT, title, url: color, description: JSON.stringify(payload) } });
  }
  return color;
}

export interface StoplightBoard {
  weekLabel: string;
  reported: number;
  expected: number;
  counts: Record<Light, number>;
  groups: {
    dept: string; emoji: string;
    people: { name: string; color: Light | null; note: string; notes: Record<Light, string>; prev: Light | null }[];
  }[];
}

/** Everyone's light for a week, grouped by department, with last week's color for the trend arrow. */
export async function getBoard(week: { start: string; label: string }): Promise<StoplightBoard> {
  const prevStart = lastWeekRange(week.start).start;
  const [reporters, cur, prev] = await Promise.all([getReporters(), getWeekReports(week.start), getWeekReports(prevStart)]);
  const counts: Record<Light, number> = { green: 0, yellow: 0, red: 0 };
  const byDept = new Map<string, StoplightBoard["groups"][number]>();
  for (const r of reporters) {
    const pos = POSITIONS.find((p) => p.key === r.position);
    const dept = pos?.label ?? "Team";
    if (!byDept.has(dept)) byDept.set(dept, { dept, emoji: pos?.emoji ?? "👥", people: [] });
    const rep = cur.get(r.id);
    if (rep) counts[rep.color]++;
    byDept.get(dept)!.people.push({
      name: r.name.split(" ")[0],
      color: rep?.color ?? null,
      note: rep ? (rep.color === "green" ? rep.greenNote : rep.color === "red" ? rep.redNote : rep.yellowNote) : "",
      notes: rep ? { green: rep.greenNote, yellow: rep.yellowNote, red: rep.redNote } : { green: "", yellow: "", red: "" },
      prev: prev.get(r.id)?.color ?? null,
    });
  }
  return {
    weekLabel: week.label,
    reported: counts.green + counts.yellow + counts.red,
    expected: reporters.length,
    counts,
    groups: [...byDept.values()],
  };
}

/** First names of everyone who hasn't reported for the week. */
export async function missingReporters(weekStart: string): Promise<string[]> {
  const [reporters, cur] = await Promise.all([getReporters(), getWeekReports(weekStart)]);
  return reporters.filter((r) => !cur.has(r.id)).map((r) => r.name.split(" ")[0]);
}
