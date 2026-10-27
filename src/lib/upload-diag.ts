import "server-only";
import { db } from "@/lib/db";

// 🔎 Record the LAST upload failure so Jon/dev can see exactly why a rep's upload
// failed (Jon 2026-10-27: Marie's uploads "still don't work" and the client only
// shows a short message). Read it via GET /api/crm/upload-doc?diag=1 (owner only).
export async function noteUploadDiag(stage: string, msg: string, actor: string): Promise<void> {
  try {
    const payload = JSON.stringify({ at: new Date().toISOString(), stage, msg: String(msg).slice(0, 400), actor });
    const row = await db.resource.findFirst({ where: { category: "__upload_diag__" } });
    if (row) await db.resource.update({ where: { id: row.id }, data: { description: payload } });
    else await db.resource.create({ data: { title: "upload-diag", category: "__upload_diag__", url: "", description: payload } });
  } catch { /* diagnostics must never break an upload */ }
}
