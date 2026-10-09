import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { readConvMap } from "@/lib/conv-read";

export const dynamic = "force-dynamic";

// 🔔 Unread-text count for the inbox bell: threads where the seller wrote last
// and nobody has opened or answered since. Managers see the whole inbox;
// reps see their own leads. Polled every ~45s by the bell — kept cheap.
export async function GET() {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ count: 0 });
  const [recent, convRead] = await Promise.all([
    db.crmEvent.findMany({ where: { kind: "sms" }, orderBy: { at: "desc" }, take: 400, select: { contactId: true, body: true, at: true } }),
    readConvMap(),
  ]);
  const latest = new Map<string, { inbound: boolean; at: Date }>();
  for (const e of recent) if (!latest.has(e.contactId)) latest.set(e.contactId, { inbound: e.body.startsWith("⬅"), at: e.at });
  const unseenIds = [...latest.entries()].filter(([cid, l]) => l.inbound && (!convRead[cid] || l.at.toISOString() > convRead[cid])).map(([cid]) => cid);
  if (unseenIds.length === 0) return NextResponse.json({ count: 0 });
  const contacts = await db.crmContact.findMany({ where: { id: { in: unseenIds }, ...(isManager(me!) ? {} : { assignedTo: { in: ["", me!.name] } }) }, select: { id: true, name: true } });
  const newest = contacts[0]?.name ?? "";
  return NextResponse.json({ count: contacts.length, newest });
}
