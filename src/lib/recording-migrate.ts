import { db } from "./db";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { gdriveConfigured, ensureSubfolder, uploadToFolder } from "./gdrive";

const MARKER = "/call-recordings/";
// Land in Jon's shared Drive (War Room Backups / Call Recordings / <month>) —
// uploads to the service account's OWN drive are invisible to the team.
async function recordingsFolder(sub: string): Promise<string> {
  const { driveRootId } = await import("./gdrive");
  const root = await ensureSubfolder(await driveRootId(), "Call Recordings");
  return ensureSubfolder(root, sub);
}

/** Move one recording: download from Supabase → upload to Drive → rewrite the
 *  score's audioUrl → delete from Supabase. Returns true if moved. */
async function moveOne(id: string, audioUrl: string): Promise<boolean> {
  const path = audioUrl.slice(audioUrl.indexOf(MARKER) + MARKER.length);
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("call-recordings").download(path);
  if (error || !data) return false;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const month = path.match(/(\d{4}-\d{2})/)?.[1] ?? "misc";
  const folder = await recordingsFolder(month);
  const up = await uploadToFolder(folder, path.split("/").pop() || `call-${id}.m4a`, bytes, data.type || "audio/mpeg");
  await db.callScore.update({ where: { id }, data: { audioUrl: up.link } });
  await admin.storage.from("call-recordings").remove([path]);
  return true;
}

/** Orphan sweep: bucket files NO CallScore row references (uploaded but never
 *  scored, or scored before Drive existed). Archived to Drive, then removed —
 *  a verified move, never a plain delete. Budgeted by bytes per run (60s cap). */
export async function sweepOrphanRecordings(maxBytes = 20 * 1048576, deadlineMs = Date.now() + 42000): Promise<{ moved: number; mb: number; remaining: number; errors: string[] }> {
  if (!gdriveConfigured() || !adminConfigured()) return { moved: 0, mb: 0, remaining: -1, errors: ["not configured"] };
  const admin = createAdminClient();
  const referenced = new Set(
    (await db.callScore.findMany({ where: { audioUrl: { contains: MARKER } }, select: { audioUrl: true } }))
      .map((r) => r.audioUrl.slice(r.audioUrl.indexOf(MARKER) + MARKER.length)),
  );
  // bucket layout: calls/<yyyy-mm-dd>/<file>
  const files: Array<{ path: string; size: number }> = [];
  const { data: days } = await admin.storage.from("call-recordings").list("calls", { limit: 1000 });
  for (const d of days ?? []) {
    const { data: inner } = await admin.storage.from("call-recordings").list(`calls/${d.name}`, { limit: 1000 });
    for (const f of inner ?? []) {
      const meta = f.metadata as { size?: number } | null;
      if (meta?.size != null) files.push({ path: `calls/${d.name}/${f.name}`, size: meta.size });
    }
  }
  // Smallest first → many quick wins per run; one oversized file can't stall the queue.
  const orphans = files.filter((f) => !referenced.has(f.path)).sort((a, b) => a.size - b.size);
  let moved = 0, bytesDone = 0;
  const errors: string[] = [];
  for (const f of orphans) {
    if (bytesDone + f.size > maxBytes && moved > 0) break; // always attempt at least one
    if (Date.now() > deadlineMs) break; // stay under the 60s function cap
    try {
      const { data, error } = await admin.storage.from("call-recordings").download(f.path);
      if (error || !data) { errors.push(f.path); continue; }
      const month = f.path.match(/(\d{4}-\d{2})/)?.[1] ?? "misc";
      const folder = await recordingsFolder(month);
      await uploadToFolder(folder, f.path.split("/").pop()!, new Uint8Array(await data.arrayBuffer()), data.type || "audio/mpeg");
      await admin.storage.from("call-recordings").remove([f.path]);
      moved++; bytesDone += f.size;
    } catch (e) { errors.push(`${f.path}: ${String(e).slice(0, 80)}`); }
  }
  return { moved, mb: Math.round(bytesDone / 1048576), remaining: orphans.length - moved, errors: errors.slice(0, 5) };
}

/** Move a single just-scored recording to Drive (called right after a call is scored
 *  so files don't linger in paid Supabase Storage). Best-effort. */
export async function migrateScoreById(id: string): Promise<boolean> {
  if (!gdriveConfigured() || !adminConfigured()) return false;
  const s = await db.callScore.findUnique({ where: { id }, select: { id: true, audioUrl: true } });
  if (!s?.audioUrl || !s.audioUrl.includes(MARKER)) return false;
  return moveOne(s.id, s.audioUrl);
}

/** Batched fallback sweep (nightly) for any recordings still on Supabase. */
export async function migrateRecordingsToDrive(limit = 3, deadlineMs = Date.now() + 20000): Promise<{ moved: number; errors: string[]; pending: number }> {
  if (!gdriveConfigured() || !adminConfigured()) return { moved: 0, errors: ["not configured"], pending: 0 };
  const where = { audioUrl: { contains: MARKER } };
  const pending = await db.callScore.count({ where });
  const scores = await db.callScore.findMany({ where, take: limit, orderBy: { createdAt: "asc" } });
  let moved = 0;
  const errors: string[] = [];
  for (const s of scores) {
    if (Date.now() > deadlineMs) break; // stay well under the 60s function cap
    try { if (await moveOne(s.id, s.audioUrl)) moved++; else errors.push(s.id); }
    catch (e) { errors.push(String(e).slice(0, 120)); }
  }
  return { moved, errors, pending };
}
