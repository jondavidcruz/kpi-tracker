import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { commsFor } from "@/lib/crm-comms";

export const dynamic = "force-dynamic";

// Softphone data: our Telnyx numbers (for "Calling From" + local presence),
// recent calls, contact search, and the user's call queue.
let numCache: { at: number; numbers: string[] } | null = null;

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ error: "no access" }, { status: 403 });
  if (!(await commsFor(me!)).call) return NextResponse.json({ error: "calling not enabled for you" }, { status: 403 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  // Telnyx numbers (10-min cache) — ONLY the ones on OUR connections; the
  // Direct REI marketing lines never show here (Jon 2026-10-07).
  let numbers: string[] = numCache && Date.now() - numCache.at < 600_000 ? numCache.numbers : [];
  if (!numbers.length && process.env.TELNYX_API_KEY) {
    try {
      const cfgRow = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } });
      let cfg: { connId?: string; ccAppId?: string } = {};
      try { cfg = cfgRow?.description ? JSON.parse(cfgRow.description) : {}; } catch { /* none */ }
      const ours = new Set([cfg.connId, cfg.ccAppId].filter(Boolean));
      const res = await fetch("https://api.telnyx.com/v2/phone_numbers?page[size]=250", { headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` }, cache: "no-store" });
      const body = (await res.json()) as { data?: Array<{ phone_number?: string; connection_id?: string }> };
      numbers = (body.data ?? []).filter((n) => ours.has(String(n.connection_id ?? ""))).map((n) => n.phone_number ?? "").filter(Boolean);
      numCache = { at: Date.now(), numbers };
    } catch { /* dial still works with the default caller id */ }
  }

  const manager = isManager(me!);
  const mine = manager ? {} : { assignedTo: { equals: me!.name, mode: "insensitive" as const } };
  const today = new Date().toISOString().slice(0, 10);

  const [recentEvents, contacts, queue] = await Promise.all([
    db.crmEvent.findMany({ where: { kind: "call", ...(manager ? {} : { actor: me!.name }) }, orderBy: { at: "desc" }, take: 15 }),
    db.crmContact.findMany({
      where: {
        archivedAt: null, phone: { not: "" },
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || q } }] } : {}),
      },
      orderBy: { updatedAt: "desc" }, take: 15,
      select: { id: true, name: true, phone: true },
    }),
    db.crmOpportunity.findMany({
      where: { archivedAt: null, ...mine, nextFollowUp: { not: "", lte: today }, stage: { notIn: ["dead", "signed"] } },
      include: { contact: { select: { id: true, name: true, phone: true } } },
      orderBy: { nextFollowUp: "asc" }, take: 25,
    }),
  ]);
  // name the recents via their contacts
  const cIds = [...new Set(recentEvents.map((e) => e.contactId))];
  const cRows = cIds.length ? await db.crmContact.findMany({ where: { id: { in: cIds } }, select: { id: true, name: true, phone: true } }) : [];
  const cById = new Map(cRows.map((c) => [c.id, c]));

  return NextResponse.json({
    numbers,
    defaultFrom: process.env.TELNYX_CALLER_ID ?? numbers[0] ?? "",
    recents: recentEvents.map((e) => ({ name: cById.get(e.contactId)?.name ?? "—", phone: cById.get(e.contactId)?.phone ?? "", contactId: e.contactId, when: e.at.toISOString(), body: e.body.slice(0, 60) })),
    contacts,
    queue: queue.filter((o) => o.contact.phone).map((o) => ({ oppId: o.id, contactId: o.contact.id, name: o.contact.name, phone: o.contact.phone, title: o.title, due: o.nextFollowUp })),
  });
}
