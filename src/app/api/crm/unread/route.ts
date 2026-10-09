import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { readConvMap, setConvRead } from "@/lib/conv-read";

export const dynamic = "force-dynamic";

// 🔔 Unread texts for the inbox bell: WHO texted, a snippet, and a link to
// reply. Managers see the whole inbox; reps their own leads. POST {op:
// "readall"} clears the badge. Polled every ~45s — kept cheap.
async function unreadThreads(meName: string, managerAll: boolean) {
  const [recent, convRead] = await Promise.all([
    db.crmEvent.findMany({ where: { kind: "sms" }, orderBy: { at: "desc" }, take: 400, select: { contactId: true, body: true, at: true } }),
    readConvMap(),
  ]);
  const latest = new Map<string, { body: string; at: Date }>();
  for (const e of recent) if (!latest.has(e.contactId)) latest.set(e.contactId, { body: e.body, at: e.at });
  const unseen = [...latest.entries()].filter(([cid, l]) => l.body.startsWith("⬅") && (!convRead[cid] || l.at.toISOString() > convRead[cid]));
  if (!unseen.length) return [];
  const contacts = await db.crmContact.findMany({
    where: { id: { in: unseen.map(([cid]) => cid) }, ...(managerAll ? {} : { assignedTo: { in: ["", meName] } }) },
    select: { id: true, name: true, phone: true, assignedTo: true },
  });
  return contacts.map((c) => {
    const l = latest.get(c.id)!;
    return { id: c.id, name: c.name, phone: c.phone, owner: c.assignedTo.split(" ")[0] || "—", snippet: l.body.replace(/^[⬅➡️️\s]*(Seller|Us):\s*/u, "").slice(0, 70), at: l.at.toISOString() };
  }).sort((a, b) => b.at.localeCompare(a.at));
}

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ count: 0, threads: [] });
  // ?thread=<contactId> → everything the bell's quick-text phone needs
  const cid = new URL(req.url).searchParams.get("thread");
  if (cid) {
    const contact = await db.crmContact.findUnique({ where: { id: cid }, select: { id: true, name: true, phone: true } });
    if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });
    const [opp, sms] = await Promise.all([
      db.crmOpportunity.findFirst({ where: { contactId: cid, archivedAt: null }, select: { id: true } }),
      db.crmEvent.findMany({ where: { contactId: cid, kind: "sms" }, orderBy: { at: "desc" }, take: 12 }),
    ]);
    await setConvRead([cid], true);
    const history = [...sms].reverse().map((e) => ({ body: e.body.replace(/^[⬅➡️️\s]*(Seller|Us):\s*/u, "").slice(0, 400), inbound: e.body.startsWith("⬅"), at: e.at.toISOString() }));
    return NextResponse.json({ id: contact.id, name: contact.name, phone: contact.phone, oppId: opp?.id ?? "", history, me: me!.name });
  }
  const threads = await unreadThreads(me!.name, isManager(me!));
  return NextResponse.json({ count: threads.length, threads: threads.slice(0, 8) });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ ok: false });
  const body = (await req.json().catch(() => ({}))) as { op?: string; id?: string };
  if (body.op === "readall") {
    const threads = await unreadThreads(me!.name, isManager(me!));
    await setConvRead(threads.map((t) => t.id), true);
    return NextResponse.json({ ok: true, cleared: threads.length });
  }
  if (body.op === "read" && body.id) {
    await setConvRead([body.id], true);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false });
}
