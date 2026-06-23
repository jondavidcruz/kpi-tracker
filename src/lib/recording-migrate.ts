import { db } from "./db";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { gdriveConfigured, uploadToDrive } from "./gdrive";

const MARKER = "/call-recordings/";

/** Move one recording: download from Supabase → upload to Drive → rewrite the
 *  score's audioUrl → delete from Supabase. Returns true if moved. */
async function moveOne(id: string, audioUrl: string): Promise<boolean> {
  const path = audioUrl.slice(audioUrl.indexOf(MARKER) + MARKER.length);
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("call-recordings").download(path);
  if (error || !data) return false;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const driveUrl = await uploadToDrive(path.split("/").pop() || `call-${id}.m4a`, bytes, data.type || "audio/mpeg");
  await db.callScore.update({ where: { id }, data: { audioUrl: driveUrl } });
  await admin.storage.from("call-recordings").remove([path]);
  return true;
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
export async function migrateRecordingsToDrive(limit = 20): Promise<{ moved: number; errors: string[]; pending: number }> {
  if (!gdriveConfigured() || !adminConfigured()) return { moved: 0, errors: ["not configured"], pending: 0 };
  const where = { audioUrl: { contains: MARKER } };
  const pending = await db.callScore.count({ where });
  const scores = await db.callScore.findMany({ where, take: limit, orderBy: { createdAt: "asc" } });
  let moved = 0;
  const errors: string[] = [];
  for (const s of scores) {
    try { if (await moveOne(s.id, s.audioUrl)) moved++; else errors.push(s.id); }
    catch (e) { errors.push(String(e).slice(0, 120)); }
  }
  return { moved, errors, pending };
}
