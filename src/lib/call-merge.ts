import { db } from "@/lib/db";

// A single phone call used to scatter across up to THREE timeline rows: the call itself
// (browser-dialer hangup / click-to-call start), the rep's DISPOSITION (logged the moment they
// pick an outcome), and the RECORDING (logged later by the async Telnyx recording.saved webhook).
// We fold all three into ONE row (Jon 2026-10-26 / 2026-11-03: "the disposition shouldn't be a
// separate note from the call I initiated"). Whichever piece lands first is the anchor; the
// others merge into it, matched by contact inside this window. A recording anchor keeps the 🎙
// prefix so the audio player still renders.
const RECENT_MS = 25 * 60 * 1000;

// Rows that represent the call itself (not a bare disposition) and can anchor the merge.
const CALL_PREFIXES = ["🎙", "Browser call", "Click-to-call"];
const isCallRow = (body: string) => CALL_PREFIXES.some((p) => body.startsWith(p));
const metaOf = (m: unknown) => (m as Record<string, unknown> | null) ?? {};

async function recentCalls(contactId: string) {
  const since = new Date(Date.now() - RECENT_MS);
  return db.crmEvent.findMany({
    where: { contactId, kind: "call", at: { gte: since } },
    orderBy: { at: "desc" }, take: 5, select: { id: true, body: true, meta: true },
  }).catch(() => [] as Array<{ id: string; body: string; meta: unknown }>);
}

/** A disposition (logged by the dialer UI when the rep picks an outcome) arriving when a row for
 *  the same call already exists → fold it into that row. Matches the call's recording OR the
 *  browser-call / click-to-call entry. Returns true if it merged (caller then logs nothing). */
export async function foldDispoIntoCall(contactId: string, summary: string): Promise<boolean> {
  if (!contactId) return false;
  const rows = await recentCalls(contactId);
  const row = rows.find((r) => isCallRow(r.body) && !metaOf(r.meta).dispo);
  if (!row) return false;
  const meta = metaOf(row.meta);
  await db.crmEvent.update({ where: { id: row.id }, data: { body: `${row.body} · ${summary}`.slice(0, 500), meta: { ...meta, dispo: summary } as never } }).catch(() => {});
  return true;
}

/** A recording landing when a row for the same call already exists (the browser-call /
 *  click-to-call start, or a bare disposition) → upgrade THAT row in place into the recording
 *  row (keeps its timeline position + any disposition it already carries). Returns true if it
 *  merged (caller then logs no separate recording row). */
export async function foldRecordingIntoCall(contactId: string, recBody: string, recMeta: Record<string, unknown>): Promise<boolean> {
  if (!contactId) return false;
  const rows = await recentCalls(contactId);
  // anchor = a call/dialer row that isn't itself a recording yet (no 🎙, no stored link)
  const row = rows.find((r) => !r.body.startsWith("🎙") && !metaOf(r.meta).link && (isCallRow(r.body) || r.body.startsWith("Dialer")));
  if (!row) return false;
  const rMeta = metaOf(row.meta);
  // Preserve the disposition: either already on meta.dispo, or derived from a bare "Dialer" body.
  const dispo = (rMeta.dispo as string | undefined) ?? (row.body.startsWith("Dialer") ? row.body.replace(/^Dialer(?: disposition)?:\s*/, "📞 ") : "");
  const body = `${recBody}${dispo ? ` · ${dispo}` : ""}`.slice(0, 500);
  await db.crmEvent.update({ where: { id: row.id }, data: { body, meta: { ...rMeta, ...recMeta, dispo: dispo || undefined } as never } }).catch(() => {});
  return true;
}
