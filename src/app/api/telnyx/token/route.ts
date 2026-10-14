import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { commsFor, firstOf } from "@/lib/crm-comms";
import { provisionAndToken } from "@/lib/telnyx-webrtc";

export const dynamic = "force-dynamic";

export async function POST() {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ error: "no access" }, { status: 403 });
  if (!(await commsFor(me!)).call) return NextResponse.json({ error: "Calling isn't enabled for you — ask Jon (Comms access on /crm)." }, { status: 403 });
  const r = await provisionAndToken(firstOf(me!.name));
  if (r.error) return NextResponse.json({ error: r.error }, { status: 502 });
  // presence breadcrumb in its OWN buffer (Jon 2026-10-13: token mints were
  // drowning out the CALL events in __telnyx_events__, hiding recording issues)
  try {
    const row = await db.resource.findFirst({ where: { category: "__telnyx_tokens__" } });
    let list: unknown[] = [];
    try { list = row?.description ? JSON.parse(row.description) : []; } catch { /* fresh */ }
    list.unshift({ at: new Date().toISOString(), agent: firstOf(me!.name) });
    const description = JSON.stringify(list.slice(0, 20));
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "telnyx-tokens", category: "__telnyx_tokens__", url: "", description } });
  } catch { /* non-blocking */ }
  return NextResponse.json({ token: r.token, callerId: r.callerId, rep: me!.name });
}
