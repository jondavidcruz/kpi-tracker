// 📎 Step 1 of the direct-to-Drive upload (Jon 2026-10-27). The browser can't POST
// a real-world file (phone photo / scanned contract, often >4.5MB) THROUGH a Vercel
// function — the platform rejects the body with a non-JSON 413 before our code runs
// ("Upload failed — the server sent a bad response"). So we resolve/create the deal's
// Drive folder, open a RESUMABLE upload session, and hand the browser the session URL.
// The browser then PUTs the bytes straight to Google; finalize logs the event.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { noteUploadDiag } from "@/lib/upload-diag";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, msg: "You're signed out — reload and sign in." });
  const b = (await req.json().catch(() => null)) as { oppId?: string; contactId?: string; fileName?: string; mime?: string; docType?: string } | null;
  if (!b) return NextResponse.json({ ok: false, msg: "Couldn't start the upload — try again." });
  const oppId = String(b.oppId ?? "");
  const contactId = String(b.contactId ?? "");
  const fileName = String(b.fileName ?? "").slice(0, 120) || "document";
  const docType = String(b.docType ?? "").trim();
  if (!oppId || !contactId) return NextResponse.json({ ok: false, msg: "Missing the lead — reopen this contact and retry." });

  try {
    const { gdriveConfigured, ensureSubfolder, listFolder, dealsParent, initResumableUpload } = await import("@/lib/gdrive");
    if (!gdriveConfigured()) { await noteUploadDiag("init", "gdrive not configured", me.name); return NextResponse.json({ ok: false, msg: "Document storage isn't configured (Google Drive). Tell Jon." }); }
    const DEALS_PARENT = await dealsParent();
    const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { title: true, contact: { select: { address: true, name: true } } } });
    const label = (opp?.contact?.address || opp?.title || opp?.contact?.name || "Unfiled").trim();
    const streetNo = label.match(/^\d+/)?.[0];
    let folderId = "";
    if (streetNo) {
      const existing = (await listFolder(DEALS_PARENT).catch(() => [])).find((f) => f.name.startsWith(streetNo));
      if (existing) folderId = existing.id;
    }
    if (!folderId) folderId = await ensureSubfolder(DEALS_PARENT, label.slice(0, 80));
    // A unique suffix keeps finalize's name-match unambiguous even if the same file
    // is uploaded twice to the same folder.
    const stamp = Date.now().toString(36);
    const driveName = `${docType ? docType + " - " : ""}${fileName} [${stamp}]`.slice(0, 160);
    const uploadUrl = await initResumableUpload(folderId, driveName, String(b.mime ?? "") || "application/octet-stream");
    return NextResponse.json({ ok: true, uploadUrl, folderId, driveName });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    await noteUploadDiag("init", msg, me.name);
    return NextResponse.json({ ok: false, msg: `Couldn't start the upload: ${msg.slice(0, 140)}` });
  }
}
