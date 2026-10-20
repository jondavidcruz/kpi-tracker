import { db } from "@/lib/db";

// ⏰ Optional time-of-day for a CRM task (Jon 2026-10-20: "there's no time slot").
// crmTask.due is a date string ("YYYY-MM-DD") compared as a date all over the app,
// so we DON'T change its format — the time lives here, keyed by taskId, in a Resource
// side-store (no schema change). Drives the "due soon" reminder popups.
const CAT = "__task_times__";

export async function readTaskTimes(): Promise<Record<string, string>> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  try { return row?.description ? (JSON.parse(row.description) as Record<string, string>) : {}; } catch { return {}; }
}

/** Set (hhmm = "HH:MM") or clear (empty) the time for a task. */
export async function setTaskTime(taskId: string, hhmm: string): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  let map: Record<string, string> = {};
  try { map = row?.description ? JSON.parse(row.description) : {}; } catch { map = {}; }
  if (hhmm) map[taskId] = hhmm; else delete map[taskId];
  const description = JSON.stringify(map);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "task-times", category: CAT, url: "", description } });
}
