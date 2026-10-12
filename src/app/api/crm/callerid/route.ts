import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ☎️ Caller-ID helper for the dialer (Jon 2026-10-12):
// ?num=+19093956195 → who that is in the CRM (name on the incoming banner)
// ?last=1           → who on the team answered the most recent inbound call
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ error: "no access" }, { status: 403 });

  if (req.nextUrl.searchParams.get("last") === "1") {
    const row = await db.resource.findFirst({ where: { category: "__last_answer__" } });
    let d: { at?: string; agent?: string; from?: string; callerName?: string } = {};
    try { d = row?.description ? JSON.parse(row.description) : {}; } catch { /* none */ }
    return NextResponse.json(d, { headers: { "Cache-Control": "private, no-store" } });
  }

  // ?claim=1 → is there a fresh "answer it on my line" request? (cross-profile)
  if (req.nextUrl.searchParams.get("claim") === "1") {
    const row = await db.resource.findFirst({ where: { category: "__ring_claim__" } });
    let d: { at?: string; agent?: string } = {};
    try { d = row?.description ? JSON.parse(row.description) : {}; } catch { /* none */ }
    return NextResponse.json(d, { headers: { "Cache-Control": "private, no-store" } });
  }

  const num = req.nextUrl.searchParams.get("num") ?? "";
  const last10 = num.replace(/\D/g, "").slice(-10);
  if (last10.length !== 10) return NextResponse.json({ name: "" });
  const c = await db.crmContact.findFirst({ where: { phone: { contains: last10 } }, select: { id: true, name: true, address: true } });
  return NextResponse.json({ name: c?.name ?? "", id: c?.id ?? "", address: c?.address ?? "" }, { headers: { "Cache-Control": "private, no-store" } });
}

// POST → "answer the ringing call on MY line" — written when someone clicks
// Answer on a banner whose browser doesn't hold their phone (Jon 2026-10-12:
// Sharyn's click couldn't reach her other profile). Her ringing client polls
// ?claim=1 and auto-answers when it sees her name.
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ error: "no access" }, { status: 403 });
  const first = me!.name.split(" ")[0].toLowerCase();
  const payload = JSON.stringify({ at: new Date().toISOString(), agent: first });
  const row = await db.resource.findFirst({ where: { category: "__ring_claim__" } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: payload } });
  else await db.resource.create({ data: { title: "ring-claim", category: "__ring_claim__", url: "", description: payload } });
  return NextResponse.json({ ok: true });
}
