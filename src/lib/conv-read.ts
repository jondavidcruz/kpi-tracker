import { db } from "@/lib/db";

// 👁 Conversation read-state (Jon 2026-10-08): the red dot clears once a
// thread is OPENED or answered; "mark unread" brings it back. One Resource
// map {contactId: lastReadAt ISO}.
const CAT = "__conv_read__";

export async function readConvMap(): Promise<Record<string, string>> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  try { return row?.description ? JSON.parse(row.description) : {}; } catch { return {}; }
}

export async function setConvRead(contactIds: string[], read: boolean): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: CAT } });
  let map: Record<string, string> = {};
  try { map = row?.description ? JSON.parse(row.description) : {}; } catch { /* fresh */ }
  const now = new Date().toISOString();
  for (const id of contactIds) { if (read) map[id] = now; else delete map[id]; }
  const keys = Object.keys(map);
  if (keys.length > 3000) for (const k of keys.slice(0, keys.length - 3000)) delete map[k];
  const description = JSON.stringify(map);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "conversation-read", category: CAT, url: "", description } });
}
