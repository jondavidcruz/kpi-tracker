import { db } from "@/lib/db";

// 📝 Task descriptions (Jon 2026-10-08: "title AND description like GHL,
// with step-by-step instructions"). One Resource map {taskId: text} — no
// migration needed.
const CAT = "__task_notes__";

export async function readTaskNotes(): Promise<Record<string, string>> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  try { return row?.description ? JSON.parse(row.description) : {}; } catch { return {}; }
}

export async function writeTaskNote(taskId: string, note: string): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: CAT } });
  let map: Record<string, string> = {};
  try { map = row?.description ? JSON.parse(row.description) : {}; } catch { /* fresh */ }
  if (note.trim()) map[taskId] = note.trim().slice(0, 4000); else delete map[taskId];
  const keys = Object.keys(map);
  if (keys.length > 1500) for (const k of keys.slice(0, keys.length - 1500)) delete map[k];
  const description = JSON.stringify(map);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "task-notes", category: CAT, url: "", description } });
}
