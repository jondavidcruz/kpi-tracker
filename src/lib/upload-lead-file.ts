// 📎 Client helper: upload a file onto a lead by sending the BYTES straight to
// Google Drive (resumable session), never through a Vercel function — so files
// over the platform's ~4.5MB request-body cap work (Jon 2026-10-27: Marie/Michelle
// "can't upload", "the server sent a bad response"). Used by the Documents panel
// and the note composers. Returns a friendly {ok,msg}.
type UploadArgs = {
  oppId: string;
  contactId: string;
  file: File;
  docType?: string;
  asNote?: boolean;
  body?: string; // note HTML, when asNote
};

export async function uploadLeadFile({ oppId, contactId, file, docType, asNote, body }: UploadArgs): Promise<{ ok: boolean; msg: string }> {
  if (!file || file.size === 0) return { ok: false, msg: "Pick a file first." };
  if (file.size > 25 * 1024 * 1024) return { ok: false, msg: `That file is ${(file.size / 1048576).toFixed(1)}MB — over the 25MB limit. Compress it and retry.` };
  try {
    // 1) open a direct-to-Drive session (tiny JSON body — safely under the cap)
    const initRes = await fetch("/api/crm/upload-init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oppId, contactId, fileName: file.name, mime: file.type, docType }),
    }).then((r) => r.json()).catch(() => null);
    if (!initRes?.ok || !initRes.uploadUrl) return { ok: false, msg: initRes?.msg || "Couldn't start the upload — try again." };

    // 2) PUT the bytes straight to Google (no Vercel in the path → no 4.5MB cap).
    //    If a cross-origin quirk hides the PUT response, don't fail here — finalize
    //    checks Drive for the file and is the real source of truth.
    try {
      await fetch(initRes.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
    } catch { /* finalize verifies whether the bytes actually landed */ }

    // 3) log it to the lead's timeline (finds the file we just wrote by its name)
    const fin = await fetch("/api/crm/upload-finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oppId, contactId, folderId: initRes.folderId, driveName: initRes.driveName, fileName: file.name, docType, asNote, body }),
    }).then((r) => r.json()).catch(() => null);
    if (!fin?.ok) return { ok: false, msg: fin?.msg || "Uploaded, but couldn't log it — refresh to check." };
    return { ok: true, msg: fin.msg };
  } catch (e) {
    return { ok: false, msg: `Upload failed: ${String((e as Error)?.message ?? e).slice(0, 120)}` };
  }
}
