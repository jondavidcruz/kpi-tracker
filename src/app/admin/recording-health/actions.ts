"use server";
// On-demand transcription + duplicate cleanup for Recording Health (Jon 2026-11-05).
// Auto-transcription is off (it failed on big files / Gemini 503s) — recordings always
// save, and a transcript is made only when the owner clicks Transcribe here.
import { db } from "@/lib/db";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { logCrmEvent } from "@/lib/crm";
import { revalidatePath } from "next/cache";

type RecMeta = { link?: string; driveId?: string; transcript?: string; secs?: number; rep?: string; txErr?: string; contactId?: string } | null;

/** Transcribe one already-filed recording on demand (owner). Pulls the audio back from
 *  Drive, runs the resilient transcriber, and stores the transcript + a summary note. */
export async function transcribeRecordingAction(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!isOwner(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const ev = await db.crmEvent.findUnique({ where: { id }, select: { id: true, contactId: true, oppId: true, meta: true, body: true } }).catch(() => null);
  const meta = (ev?.meta as RecMeta) ?? null;
  if (!ev || !meta?.driveId) { revalidatePath("/admin/recording-health"); return; }

  const { downloadFromDrive } = await import("@/lib/gdrive");
  const bytes = await downloadFromDrive(meta.driveId).catch(() => null);
  if (!bytes) {
    await db.crmEvent.update({ where: { id }, data: { meta: { ...meta, txErr: "couldn't download audio from Drive" } as never } }).catch(() => {});
    revalidatePath("/admin/recording-health"); return;
  }
  const { transcribeCall } = await import("@/lib/transcribe");
  const tx = await transcribeCall(bytes, "audio/mp3");
  if (tx.transcript) {
    await db.crmEvent.update({ where: { id }, data: { meta: { ...meta, transcript: tx.transcript.slice(0, 12000), txErr: undefined } as never } }).catch(() => {});
    if (tx.summary) await logCrmEvent({ contactId: ev.contactId, oppId: ev.oppId ?? "", kind: "note", body: `📞 Call summary (AI, on-demand)\n${tx.summary}`.slice(0, 2000), actor: "recorder" }).catch(() => {});
  } else {
    await db.crmEvent.update({ where: { id }, data: { meta: { ...meta, txErr: tx.error || "no transcript produced" } as never } }).catch(() => {});
  }
  revalidatePath("/admin/recording-health");
}

/** Remove duplicate disposition / call rows (Jon 2026-11-05: "the dialer disposition logged
 *  6x"). Keeps the EARLIEST of each identical (contact + body) group from the last 7 days. */
export async function dedupeDispositionsAction(): Promise<void> {
  const me = await getCurrentUser();
  if (!isOwner(me)) return;
  const since = new Date(Date.now() - 7 * 86_400_000);
  const rows = await db.crmEvent.findMany({
    where: { kind: "call", at: { gte: since } },
    orderBy: { at: "asc" }, select: { id: true, contactId: true, body: true },
  }).catch(() => [] as Array<{ id: string; contactId: string; body: string }>);
  const seen = new Set<string>();
  const dupeIds: string[] = [];
  for (const r of rows) {
    const key = `${r.contactId}::${r.body}`;
    if (seen.has(key)) dupeIds.push(r.id); // a later identical row → a duplicate
    else seen.add(key);
  }
  if (dupeIds.length) await db.crmEvent.deleteMany({ where: { id: { in: dupeIds } } }).catch(() => {});
  revalidatePath("/admin/recording-health");
}
