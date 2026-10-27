// 📎 Step 2 of the lead-file upload (Jon 2026-10-27). The browser streams the file to
// Drive in ≤4MB chunks THROUGH this endpoint. Each request is well under Vercel's
// ~4.5MB body cap, and the server→Google PUT has no CORS limit — so this works for
// any file size and avoids the cross-origin PUT that the browser couldn't make
// directly. We relay each chunk to the resumable session URL opened by upload-init.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { noteUploadDiag } from "@/lib/upload-diag";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, msg: "You're signed out — reload and sign in." });
  const sessionUrl = req.headers.get("x-session-url") || "";
  const start = Number(req.headers.get("x-chunk-start") || "0");
  const total = Number(req.headers.get("x-total-size") || "0");
  // SSRF guard: only ever relay to Google's own upload host.
  if (!/^https:\/\/[a-z0-9.-]*\.googleapis\.com\//i.test(sessionUrl) || !Number.isFinite(total) || total <= 0) {
    return NextResponse.json({ ok: false, msg: "Bad chunk request." });
  }
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return NextResponse.json({ ok: false, msg: "Empty chunk." });
  const end = start + buf.length; // exclusive
  try {
    const r = await fetch(sessionUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${start}-${end - 1}/${total}` },
      body: buf,
    });
    if (r.status === 308) return NextResponse.json({ ok: true, done: false }); // more chunks expected
    if (r.status === 200 || r.status === 201) {
      const j = (await r.json().catch(() => ({}))) as { id?: string; webViewLink?: string };
      return NextResponse.json({ ok: true, done: true, id: j.id || "", link: j.webViewLink || (j.id ? `https://drive.google.com/file/d/${j.id}/view` : "") });
    }
    const t = await r.text().catch(() => "");
    await noteUploadDiag("chunk", `Drive ${r.status} @${start}-${end - 1}/${total}: ${t.slice(0, 200)}`, me.name);
    return NextResponse.json({ ok: false, msg: `Drive rejected a chunk (${r.status}). Try again.` });
  } catch (e) {
    await noteUploadDiag("chunk", `exception: ${String((e as Error)?.message ?? e)}`, me.name);
    return NextResponse.json({ ok: false, msg: `Upload interrupted — try again.` });
  }
}
