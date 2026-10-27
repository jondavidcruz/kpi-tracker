// 📎 Client helper: upload a file onto a lead by streaming it to Google Drive in
// ≤4MB chunks THROUGH our own server (same-origin, each request under Vercel's
// ~4.5MB body cap; the server forwards each chunk to Drive's resumable session).
// This avoids BOTH the platform body cap AND the cross-origin PUT the browser
// couldn't make directly — the two reasons uploads failed for Marie & Michelle
// (Jon 2026-10-27). Used by the Documents panel and the note composers.
type UploadArgs = {
  oppId: string;
  contactId: string;
  file: File;
  docType?: string;
  asNote?: boolean;
  body?: string; // note HTML, when asNote
  onProgress?: (pct: number) => void;
};

const CHUNK = 4 * 1024 * 1024; // 4MB — under the 4.5MB cap, a multiple of 256KB (Drive requirement)

export async function uploadLeadFile({ oppId, contactId, file, docType, asNote, body, onProgress }: UploadArgs): Promise<{ ok: boolean; msg: string }> {
  if (!file || file.size === 0) return { ok: false, msg: "Pick a file first." };
  if (file.size > 100 * 1024 * 1024) return { ok: false, msg: `That file is ${(file.size / 1048576).toFixed(0)}MB — over the 100MB limit. Compress it and retry.` };
  try {
    // 1) open a direct-to-Drive resumable session (tiny JSON body)
    const initRes = await fetch("/api/crm/upload-init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oppId, contactId, fileName: file.name, mime: file.type, docType }),
    }).then((r) => r.json()).catch(() => null);
    if (!initRes?.ok || !initRes.uploadUrl) return { ok: false, msg: initRes?.msg || "Couldn't start the upload — try again." };

    // 2) stream the file to Drive in chunks, relayed through our server
    const total = file.size;
    let fileId = "";
    let link = "";
    for (let start = 0; start < total; start += CHUNK) {
      const end = Math.min(start + CHUNK, total);
      const res = await fetch("/api/crm/upload-chunk", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-session-url": initRes.uploadUrl,
          "x-chunk-start": String(start),
          "x-total-size": String(total),
        },
        body: file.slice(start, end),
      }).then((r) => r.json()).catch(() => null);
      if (!res?.ok) return { ok: false, msg: res?.msg || "Upload failed mid-transfer — try again." };
      if (res.done) { fileId = res.id || ""; link = res.link || ""; }
      onProgress?.(Math.round((end / total) * 100));
    }

    // 3) log it to the lead's timeline
    const fin = await fetch("/api/crm/upload-finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oppId, contactId, folderId: initRes.folderId, driveName: initRes.driveName, fileName: file.name, docType, asNote, body, fileId, link }),
    }).then((r) => r.json()).catch(() => null);
    if (!fin?.ok) return { ok: false, msg: fin?.msg || "Uploaded, but couldn't log it — refresh to check." };
    return { ok: true, msg: fin.msg };
  } catch (e) {
    return { ok: false, msg: `Upload failed: ${String((e as Error)?.message ?? e).slice(0, 120)}` };
  }
}
