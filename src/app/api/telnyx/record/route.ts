import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function breadcrumb(entry: Record<string, unknown>) {
  try {
    const row = await db.resource.findFirst({ where: { category: "__telnyx_events__" } });
    let list: unknown[] = [];
    try { list = row?.description ? JSON.parse(row.description) : []; } catch { /* fresh */ }
    list.unshift({ at: new Date().toISOString(), ...entry });
    const description = JSON.stringify(list.slice(0, 25));
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "telnyx-events", category: "__telnyx_events__", url: "", description } });
  } catch { /* logging never blocks */ }
}

// 🎙 Start recording an OUTBOUND browser (WebRTC) call (Jon 2026-10-13). The
// webhook's record_start fires reliably for INBOUND calls (on the winner
// bridge) but not for WebRTC-originated outbound legs, so the dialer calls this
// the moment an outbound call connects, passing the call's control id.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ ok: false }, { status: 403 });
  const key = process.env.TELNYX_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "no key" });
  let ccId = "";
  try { const b = (await req.json()) as { callControlId?: string }; ccId = (b?.callControlId ?? "").trim(); } catch { /* no body */ }
  if (!ccId) { await breadcrumb({ ev: "record-request", result: "no-id", agent: me!.name.split(" ")[0] }); return NextResponse.json({ ok: false, reason: "no id" }); }
  try {
    const r = await fetch(`https://api.telnyx.com/v2/calls/${ccId}/actions/record_start`, {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ format: "mp3", channels: "dual" }),
    });
    await breadcrumb({ ev: "record-request", status: r.status, cc: ccId.slice(0, 8), agent: me!.name.split(" ")[0] });
    return NextResponse.json({ ok: r.ok, status: r.status });
  } catch (e) {
    await breadcrumb({ ev: "record-request", result: "error", agent: me!.name.split(" ")[0] });
    return NextResponse.json({ ok: false, error: String(e).slice(0, 100) });
  }
}
