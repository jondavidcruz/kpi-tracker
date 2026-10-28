// 📎 Document upload as a real API ROUTE (Jon 2026-10-27: attaching files "still not working").
// It was a server action with no maxDuration, so a larger file to Drive timed out → the client
// got "unexpected response" and the panel crashed. A route gives us maxDuration=60 + clean JSON.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { logCrmEvent } from "@/lib/crm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 🔎 GET ?diag=1 (owner only) → the LAST upload failure recorded by any stage of the
// upload pipeline, so Jon/dev can see exactly why a rep's upload failed.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const bySecret = !!secret && (req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("secret") === secret);
  const me = await getCurrentUser().catch(() => null);
  if (!bySecret && !isOwner(me)) return NextResponse.json({ error: "owner only" }, { status: 403 });
  if (url.searchParams.get("diag") !== "1") return NextResponse.json({ ok: true });
  const row = await db.resource.findFirst({ where: { category: "__upload_diag__" } });
  let d: unknown = null;
  try { d = row?.description ? JSON.parse(row.description) : null; } catch { /* none */ }
  return NextResponse.json({ ok: true, lastFailure: d });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, msg: "You're signed out — reload and sign in." });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, msg: "Couldn't read the upload — try again." });
  const oppId = String(form.get("oppId") ?? "");
  const contactId = String(form.get("contactId") ?? "");
  const docType = String(form.get("docType") ?? "").trim();
  // 📝 When the quick-view / lead-page NOTE composer attaches a file, it posts here
  // (route = maxDuration 60, so a Drive upload can't time out the way the note
  // server action did — Jon 2026-10-27 "attaching files from the quick view notes
  // section still not working"). `asNote` + optional `body` log a note instead of a doc.
  const asNote = String(form.get("asNote") ?? "") === "1";
  const rawBody = String(form.get("body") ?? "");
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
    if (asNote) {
      // Log as a NOTE (same shape as addCrmNoteAction) so it lands in the notes feed,
      // with the Drive link in meta and the typed note text (if any) as the body.
      const { sanitizeNoteHtml } = await import("@/lib/note-html");
      const body = sanitizeNoteHtml(rawBody.trim()).slice(0, 8000);
      const hasText = !!body.replace(/<[^>]*>/g, "").trim();
      await logCrmEvent({ contactId, oppId, kind: "note", body: hasText ? body : `📎 ${file.name}`, meta: { driveId: up.id, link: up.link, name: file.name }, actor: me.name });
      return NextResponse.json({ ok: true, msg: `✓ Note saved with “${file.name}”.` });
    }
    await logCrmEvent({ contactId, oppId, kind: "file", body: `📎 ${title} — uploaded to the deal's Drive folder`, meta: { driveId: up.id, link: up.link, docType }, actor: me.name });
    return NextResponse.json({ ok: true, msg: `✓ "${title}" uploaded to the deal's Drive folder.` });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 180);
    await logCrmEvent({ contactId, oppId, kind: "system", body: `📎 Upload failed: ${msg}`, actor: me.name }).catch(() => {});
    return NextResponse.json({ ok: false, msg: `Upload failed: ${msg}` });
  }
}
