import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { firstOf } from "@/lib/crm-comms";

export const dynamic = "force-dynamic";

// 💓 Dialer presence heartbeat (Jon 2026-10-09): the DialPad pings this every
// 60s while its Telnyx socket is CONNECTED, so inbound ring-all knows which
// agents' browsers are actually awake and only dials those. Cheap on purpose.
export async function POST() {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ ok: false }, { status: 403 });
  try {
    const row = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } });
    if (!row?.description) return NextResponse.json({ ok: false });
    const cfg = JSON.parse(row.description) as { agents?: Record<string, { lastSeen?: string }> };
    const a = cfg.agents?.[firstOf(me!.name)];
    if (!a) return NextResponse.json({ ok: false, reason: "no agent credential yet" });
    a.lastSeen = new Date().toISOString();
    await db.resource.update({ where: { id: row.id }, data: { description: JSON.stringify(cfg) } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
