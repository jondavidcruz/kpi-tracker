import { db } from "./db";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { gdriveConfigured, uploadToDrive } from "./gdrive";

const MARKER = "/call-recordings/";

/** Move call recordings off (paid) Supabase Storage into the (free) Drive folder:
 *  download from Supabase → upload to Drive → rewrite the score's audioUrl → delete
 *  from Supabase. Idempotent and batched so it can run nightly. */
export async function migrateRecordingsToDrive(limit = 20): Promise<{ moved: number; errors: string[]; pending: number }> {
  if (!gdriveConfigured() || !adminConfigured()) return { moved: 0, errors: ["not configured"], pending: 0 };
  const where = { audioUrl: { contains: MARKER } };
  const pending = await db.callScore.count({ where });
  const scores = await db.callScore.findMany({ where, take: limit, orderBy: { createdAt: "asc" } });
  const admin = createAdminClient();
  let moved = 0;
  const errors: string[] = [];
  for (const s of scores) {
    const path = s.audioUrl.slice(s.audioUrl.indexOf(MARKER) + MARKER.length);
    try {
      const { data, error } = await admin.storage.from("call-recordings").download(path);
      if (error || !data) { errors.push(`download ${path}`); continue; }
      const bytes = new Uint8Array(await data.arrayBuffer());
      const driveUrl = await uploadToDrive(path.split("/").pop() || `call-${s.id}.m4a`, bytes, data.type || "audio/mpeg");
      await db.callScore.update({ where: { id: s.id }, data: { audioUrl: driveUrl } });
      await admin.storage.from("call-recordings").remove([path]);
      moved++;
    } catch (e) {
      errors.push(String(e).slice(0, 120));
    }
  }
  return { moved, errors, pending };
}
