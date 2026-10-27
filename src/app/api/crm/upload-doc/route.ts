// 📎 Document upload as a real API ROUTE (Jon 2026-10-27: attaching files "still not working").
// It was a server action with no maxDuration, so a larger file to Drive timed out → the client
// got "unexpected response" and the panel crashed. A route gives us maxDuration=60 + clean JSON.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logCrmEvent } from "@/lib/crm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, msg: "You're signed out — reload and sign in." });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, msg: "Couldn't read the upload — try again." });
  const oppId = String(form.get("oppId") ?? "");
  const contactId = String(form.get("contactId") ?? "");
  const docType = String(form.get("docType") ?? "").trim();
  const file = form.get("file");
  if (!oppId || !contactId) return NextResponse.json({ ok: false, msg: "Missing the lead — reopen this contact and retry." });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, msg: "Pick a file first." });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ ok: false, msg: `That file is ${(file.size / 1048576).toFixed(1)}MB — over the 15MB limit. Compress it and retry.` });

  const title = docType || file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim() || file.name;
  try {
    const { gdriveConfigured, ensureSubfolder, uploadToFolder, listFolder, dealsParent } = await import("@/lib/gdrive");
    if (!gdriveConfigured()) return NextResponse.json({ ok: false, msg: "Document storage isn't configured (Google Drive). Tell Jon." });
    const DEALS_PARENT = await dealsParent();
    const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { title: true, contact: { select: { address: true, name: true } } } });
    const label = (opp?.contact.address || opp?.title || opp?.contact.name || "Unfiled").trim();
    const streetNo = label.match(/^\d+/)?.[0];
    let folderId = "";
    if (streetNo) {
      const existing = (await listFolder(DEALS_PARENT).catch(() => [])).find((f) => f.name.startsWith(streetNo));
      if (existing) folderId = existing.id;
    }
    if (!folderId) folderId = await ensureSubfolder(DEALS_PARENT, label.slice(0, 80));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const driveName = `${docType ? docType + " - " : ""}${file.name}`.slice(0, 120);
    const up = await uploadToFolder(folderId, driveName, bytes, file.type || "application/octet-stream");
    await logCrmEvent({ contactId, oppId, kind: "file", body: `📎 ${title} — uploaded to the deal's Drive folder`, meta: { driveId: up.id, link: up.link, docType }, actor: me.name });
    return NextResponse.json({ ok: true, msg: `✓ "${title}" uploaded to the deal's Drive folder.` });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 180);
    await logCrmEvent({ contactId, oppId, kind: "system", body: `📎 Upload failed: ${msg}`, actor: me.name }).catch(() => {});
    return NextResponse.json({ ok: false, msg: `Upload failed: ${msg}` });
  }
}
