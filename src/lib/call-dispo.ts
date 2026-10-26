import { db } from "@/lib/db";

// 📞 Recent call dispositions (Jon 2026-10-26): the rep's disposition is the authority on
// whether a recording is a real conversation or a voicemail/no-answer. The dialer writes
// here; the recording webhook reads it (dispositions often land BEFORE Telnyx finishes
// processing the recording, so duration alone isn't enough). Small Resource-backed map.
const CAT = "__call_dispos__";
type Dispo = { outcome: string; at: string };

// Dispositions that mean "no real conversation" → the recording should NOT stay in Drive.
export const NO_KEEP_OUTCOMES = ["voicemail", "no_answer", "wrong_number"];

export async function recordCallDispo(contactId: string, outcome: string): Promise<void> {
  if (!contactId || !outcome) return;
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  let map: Record<string, Dispo> = {};
  try { map = row?.description ? JSON.parse(row.description) : {}; } catch { map = {}; }
  map[contactId] = { outcome, at: new Date().toISOString() };
  const cutoff = Date.now() - 86400000; // prune > 1 day
  for (const k of Object.keys(map)) { if (Date.parse(map[k].at) < cutoff) delete map[k]; }
  const description = JSON.stringify(map);
  try {
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "call-dispos", category: CAT, url: "", description } });
  } catch { /* best-effort */ }
}

export async function readRecentCallDispo(contactId: string, withinMs = 12 * 60000): Promise<Dispo | null> {
  if (!contactId) return null;
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  let map: Record<string, Dispo> = {};
  try { map = row?.description ? JSON.parse(row.description) : {}; } catch { return null; }
  const d = map[contactId];
  return d && Date.now() - Date.parse(d.at) <= withinMs ? d : null;
}

/** Pull the most recent filed recording for a contact back out of Drive + strip it from
 *  the timeline — used when the rep dispositions the call as a voicemail/no-answer AFTER it
 *  was already filed (e.g. a long voicemail that passed the duration gate). Best-effort. */
export async function removeRecentRecording(contactId: string, withinMs = 20 * 60000): Promise<boolean> {
  if (!contactId) return false;
  const ev = await db.crmEvent.findFirst({
    where: { contactId, kind: "call", body: { startsWith: "🎙" }, at: { gte: new Date(Date.now() - withinMs) } },
    orderBy: { at: "desc" },
  }).catch(() => null);
  if (!ev) return false;
  const meta = (ev.meta ?? {}) as { driveId?: string; link?: string };
  const { trashDriveFile, driveFileId } = await import("@/lib/gdrive");
  const fileId = meta.driveId || driveFileId(meta.link);
  const trashed = fileId ? await trashDriveFile(fileId).catch(() => false) : false;
  // Strip the link so the inline player + Documents stop showing it; keep a breadcrumb note.
  await db.crmEvent.update({
    where: { id: ev.id },
    data: { body: "📞 Call recording removed — dispositioned as voicemail / no answer", meta: { ...meta, link: "", driveId: "", removed: true } as never },
  }).catch(() => {});
  return trashed;
}
