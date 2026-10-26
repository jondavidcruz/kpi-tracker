import { db } from "@/lib/db";

// A call's DISPOSITION (logged by the dialer UI the moment the rep picks an outcome) and its
// RECORDING (logged later by the async Telnyx recording.saved webhook) used to land as TWO
// separate "Call" entries on the timeline. We fold them into ONE (Jon 2026-10-26: keep the
// timeline clean). Whichever half arrives second merges into the first, matched by contact
// inside this window. The combined entry keeps the 🎙 prefix so the audio player still renders.
const RECENT_MS = 25 * 60 * 1000;

/** Dialer disposition arriving when a recording for the same call already exists → fold the
 *  disposition into that recording entry. Returns true if it merged (caller then logs nothing). */
export async function foldDispoIntoRecording(contactId: string, summary: string): Promise<boolean> {
  if (!contactId) return false;
  const since = new Date(Date.now() - RECENT_MS);
  const rec = await db.crmEvent.findFirst({
    where: { contactId, kind: "call", at: { gte: since }, body: { startsWith: "🎙" } },
    orderBy: { at: "desc" }, select: { id: true, body: true, meta: true },
  }).catch(() => null);
  if (!rec) return false;
  const meta = (rec.meta as Record<string, unknown> | null) ?? {};
  if (meta.dispo) return false; // already carries a disposition
  await db.crmEvent.update({ where: { id: rec.id }, data: { body: `${rec.body} · ${summary}`.slice(0, 500), meta: { ...meta, dispo: summary } as never } }).catch(() => {});
  return true;
}

/** Recording landing when a bare disposition for the same call already exists → upgrade THAT
 *  entry in place into the combined recording+disposition entry (keeps its timeline position).
 *  Returns true if it merged (caller then logs no separate recording entry). */
export async function foldRecordingIntoDispo(contactId: string, recBody: string, recMeta: Record<string, unknown>): Promise<boolean> {
  if (!contactId) return false;
  const since = new Date(Date.now() - RECENT_MS);
  const d = await db.crmEvent.findFirst({
    where: { contactId, kind: "call", at: { gte: since }, body: { startsWith: "Dialer" } },
    orderBy: { at: "desc" }, select: { id: true, body: true, meta: true },
  }).catch(() => null);
  if (!d) return false;
  const dMeta = (d.meta as Record<string, unknown> | null) ?? {};
  if (dMeta.link) return false; // already upgraded with a recording
  const summary = d.body.replace(/^Dialer(?: disposition)?:\s*/, "📞 ");
  await db.crmEvent.update({ where: { id: d.id }, data: { body: `${recBody} · ${summary}`.slice(0, 500), meta: { ...recMeta, dispo: summary } as never } }).catch(() => {});
  return true;
}
