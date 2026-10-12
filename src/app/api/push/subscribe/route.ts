import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { firstOf } from "@/lib/crm-comms";
import { saveSub, removeSub } from "@/lib/push";

export const dynamic = "force-dynamic";

// 📲 Push subscription endpoint for the installed War Room app.
// GET → the VAPID public key (fetched at runtime so no build-time env games).
// POST {sub} → store this device for the signed-in user. DELETE {endpoint} → remove.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "no access" }, { status: 401 });
  return NextResponse.json({ key: process.env.VAPID_PUBLIC_KEY ?? "" });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "no access" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { sub?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };
  const s = body.sub;
  if (!s?.endpoint || !s.keys?.p256dh || !s.keys.auth) return NextResponse.json({ error: "bad subscription" }, { status: 400 });
  await saveSub(firstOf(me.name), { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "no access" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (body.endpoint) await removeSub(firstOf(me.name), body.endpoint);
  return NextResponse.json({ ok: true });
}
