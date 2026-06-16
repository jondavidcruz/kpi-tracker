// Weekly EOS pulse email to managers (Marie + Jon): off-track Rocks, To-Do
// completion, and open-issue counts so accountability doesn't depend on anyone
// opening the app. Deliberately leaks NO owner-only issue/to-do text — only
// public Rock titles and aggregate counts.
import { db } from "./db";
import { getSettings } from "./data";
import { todayStr } from "./date";
import { quarterOf, quarterLabel } from "./eos";
import { alertEmailHtml, sendEmailTo } from "./notify";

export async function sendEosPulse(date?: string): Promise<boolean> {
  const settings = await getSettings();
  const today = date ?? todayStr(settings.orgTimezone);
  const quarter = quarterOf(today);

  const [rocks, openIssues, topIssues, todos, managers] = await Promise.all([
    db.rock.findMany({ where: { quarter } }),
    db.issue.count({ where: { status: "open" } }),
    db.issue.count({ where: { status: "open", priority: { gt: 0 } } }),
    db.toDo.findMany({}),
    db.user.findMany({ where: { active: true, role: { in: ["manager", "admin"] } }, select: { email: true } }),
  ]);
  const to = managers.map((m) => m.email).filter(Boolean);
  if (!to.length) return false;

  const offTrack = rocks.filter((r) => r.status === "off_track");
  const onTrack = rocks.filter((r) => r.status === "on_track").length;
  const doneRocks = rocks.filter((r) => r.status === "done").length;
  const doneTodos = todos.filter((t) => t.done).length;
  const todoPct = todos.length ? Math.round((doneTodos / todos.length) * 100) : 0;
  const overdue = todos.filter((t) => !t.done && t.dueDate && t.dueDate < today).length;

  const lines: string[] = [];
  lines.push(`Rocks (${quarterLabel(quarter)}): ${onTrack} on track · ${offTrack.length} off track · ${doneRocks} done`);
  if (offTrack.length) {
    lines.push("Off-track Rocks to address:");
    for (const r of offTrack) lines.push(`• ${r.title}${r.owner ? ` — ${r.owner}` : r.isCompany ? " — Company" : ""}`);
  }
  lines.push(`To-Dos: ${todoPct}% done${overdue ? ` · ${overdue} overdue` : ""} (target 90%).`);
  lines.push(`Issues: ${openIssues} open${topIssues ? ` (${topIssues} prioritized)` : ""} — work them in the Level 10.`);
  lines.push("Open the war room → Leadership Meeting to run the L10.");

  const html = alertEmailHtml(`🧭 EOS pulse — week of ${today}`, lines);
  return sendEmailTo(to, `🧭 EOS pulse: ${offTrack.length} off-track rocks · ${openIssues} open issues`, html);
}
