import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { readConvMap, setConvRead } from "@/lib/conv-read";

export const dynamic = "force-dynamic";

// 🔔 Unread texts for the inbox bell: WHO texted, a snippet, and a link to
// reply. Managers see the whole inbox; reps their own leads. POST {op:
// "readall"} clears the badge. Polled every ~45s — kept cheap.
async function smsThreads(meName: string, managerAll: boolean) {
  const [recent, convRead] = await Promise.all([
    db.crmEvent.findMany({ where: { kind: "sms" }, orderBy: { at: "desc" }, take: 400, select: { contactId: true, body: true, at: true } }),
    readConvMap(),
  ]);
  const latest = new Map<string, { body: string; at: Date }>();
  for (const e of recent) if (!latest.has(e.contactId)) latest.set(e.contactId, { body: e.body, at: e.at });
  if (!latest.size) return { unread: [], all: [] };
  const contacts = await db.crmContact.findMany({
    where: { id: { in: [...latest.keys()] }, ...(managerAll ? {} : { assignedTo: { in: ["", meName] } }) },
    select: { id: true, name: true, phone: true, assignedTo: true },
  });
  const rows = contacts.map((c) => {
    const l = latest.get(c.id)!;
    const unread = l.body.startsWith("⬅") && (!convRead[c.id] || l.at.toISOString() > convRead[c.id]);
    return { id: c.id, name: c.name, phone: c.phone, owner: c.assignedTo.split(" ")[0] || "—", snippet: l.body.replace(/^[⬅➡️️\s]*(Seller|Us):\s*/u, "").slice(0, 70), at: l.at.toISOString(), unread };
  }).sort((a, b) => b.at.localeCompare(a.at));
  return { unread: rows.filter((r) => r.unread), all: rows };
}

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ count: 0, threads: [] });
  // ?q=<text> → contact search for the bell's iPhone search bar
  const q = new URL(req.url).searchParams.get("q");
  if (q && q.trim().length >= 2) {
    const digits = q.replace(/\D/g, "");
    const contacts = await db.crmContact.findMany({
      where: { archivedAt: null, OR: [{ name: { contains: q.trim(), mode: "insensitive" } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] },
      orderBy: { updatedAt: "desc" }, take: 8,
      select: { id: true, name: true, phone: true },
    });
    return NextResponse.json({ contacts });
  }
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
    const history = [...sms].reverse().map((e) => {
      const m = e.meta as { line?: string } | null;
      return { body: e.body.replace(/^[⬅➡️️\s]*(Seller|Us):\s*/u, "").slice(0, 400), inbound: e.body.startsWith("⬅"), at: e.at.toISOString(), line: m?.line ?? "" };
    });
    // 📌 the line this lead already knows — newest message that recorded one
    const suggestFrom = [...history].reverse().find((h) => h.line)?.line ?? "";
    return NextResponse.json({ id: contact.id, name: contact.name, phone: contact.phone, oppId: opp?.id ?? "", history, suggestFrom, me: me!.name });
  }
  const { unread, all } = await smsThreads(me!.name, isManager(me!));
  // threads = unread (badge + legacy consumers); recent = iPhone Messages list
  return NextResponse.json({ count: unread.length, threads: unread.slice(0, 8), recent: all.slice(0, 10) });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ ok: false });
  const body = (await req.json().catch(() => ({}))) as { op?: string; id?: string };
  if (body.op === "readall") {
    const { unread } = await smsThreads(me!.name, isManager(me!));
    await setConvRead(unread.map((t) => t.id), true);
    return NextResponse.json({ ok: true, cleared: unread.length });
  }
  if (body.op === "read" && body.id) {
    await setConvRead([body.id], true);
    return NextResponse.json({ ok: true });
  }
  // {op:"ensure", phone, name?} → text ANY number from the bell's iPhone:
  // find the contact by last-10 or create one, return its id for openThread.
  const b2 = body as { op?: string; phone?: string; name?: string };
  if (b2.op === "ensure" && b2.phone) {
    const phone = String(b2.phone).replace(/[^+\d]/g, "");
    const last10 = phone.replace(/\D/g, "").slice(-10);
    if (last10.length !== 10) return NextResponse.json({ ok: false, error: "need a 10-digit number" });
    let contact = await db.crmContact.findFirst({ where: { phone: { contains: last10 } }, select: { id: true } });
    if (!contact) {
      contact = await db.crmContact.create({
        data: { name: String(b2.name ?? "").trim() || `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`, phone: phone.startsWith("+") ? phone : `+1${last10}`, source: "Manual (bell quick text)", assignedTo: me!.name },
        select: { id: true },
      });
    }
    return NextResponse.json({ ok: true, id: contact.id });
  }
  return NextResponse.json({ ok: false });
}
