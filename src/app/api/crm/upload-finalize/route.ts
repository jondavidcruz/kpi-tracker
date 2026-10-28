// 📎 Step 3 of the direct-to-Drive upload (Jon 2026-10-27). The browser has PUT the
// bytes straight to Drive's resumable session; now we locate the file in the deal
// folder (by the unique name init assigned — robust even if CORS hid Google's PUT
// response) and log it to the lead's timeline as a document or a note.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logCrmEvent } from "@/lib/crm";
import { noteUploadDiag } from "@/lib/upload-diag";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, msg: "You're signed out — reload and sign in." });
  const b = (await req.json().catch(() => null)) as
    | { oppId?: string; contactId?: string; folderId?: string; driveName?: string; fileName?: string; docType?: string; asNote?: boolean; body?: string; fileId?: string; link?: string; makePublic?: boolean }
    | null;
  if (!b) return NextResponse.json({ ok: false, msg: "Couldn't finish the upload — try again." });
  const oppId = String(b.oppId ?? "");
  const contactId = String(b.contactId ?? "");
  const folderId = String(b.folderId ?? "");
  const driveName = String(b.driveName ?? "");
  const docType = String(b.docType ?? "").trim();
  const fileName = String(b.fileName ?? "").trim() || driveName.replace(/\s*\[[0-9a-z]+\]$/i, "");
  if (!oppId || !contactId || !driveName) return NextResponse.json({ ok: false, msg: "Missing upload details — retry." });

  try {
    // Prefer the fileId the chunk relay already returned; only fall back to a
    // folder scan (by the unique name init assigned) if we didn't get one.
    let fileId = String(b.fileId ?? "").trim();
    if (!fileId) {
      const { listFolder } = await import("@/lib/gdrive");
      const files = folderId ? await listFolder(folderId).catch(() => [] as { id: string; name: string; createdTime: string }[]) : [];
      const hit = files.filter((f) => f.name === driveName).sort((a, b2) => (b2.createdTime || "").localeCompare(a.createdTime || ""))[0];
      fileId = hit?.id ?? "";
    }
    if (!fileId) { await noteUploadDiag("finalize", `no file found (folder=${folderId}, name=${driveName})`, me.name); return NextResponse.json({ ok: false, msg: "Upload didn't land in Drive — try again." }); }
    let link = String(b.link ?? "").trim() || `https://drive.google.com/file/d/${fileId}/view`;
    const hit = { id: fileId };
    // 🔗 For an emailed attachment, grant anyone-with-link read so the external recipient
    // can open it (Jon 2026-10-27: large email attachments must still reach the seller).
    if (b.makePublic) {
      try {
        const { getAccessToken } = await import("@/lib/gdrive");
        const token = await getAccessToken();
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ role: "reader", type: "anyone" }),
        }).catch(() => {});
        link = `https://drive.google.com/file/d/${fileId}/view`;
      } catch { /* link still returned; may require sign-in */ }
    }

    if (b.asNote) {
      const { sanitizeNoteHtml } = await import("@/lib/note-html");
      const noteBody = sanitizeNoteHtml(String(b.body ?? "").trim()).slice(0, 8000);
      const hasText = !!noteBody.replace(/<[^>]*>/g, "").trim();
      await logCrmEvent({ contactId, oppId, kind: "note", body: hasText ? noteBody : `📎 ${fileName}`, meta: { driveId: hit.id, link, name: fileName }, actor: me.name });
      return NextResponse.json({ ok: true, msg: `✓ Note saved with “${fileName}”.`, link });
    }
    const title = docType || fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim() || fileName;
    await logCrmEvent({ contactId, oppId, kind: "file", body: `📎 ${title} — uploaded to the deal's Drive folder`, meta: { driveId: hit.id, link, docType }, actor: me.name });
    return NextResponse.json({ ok: true, msg: `✓ "${title}" uploaded to the deal's Drive folder.`, link });
  } catch (e) {
    return NextResponse.json({ ok: false, msg: `Couldn't finish the upload: ${String((e as Error)?.message ?? e).slice(0, 140)}` });
  }
}
