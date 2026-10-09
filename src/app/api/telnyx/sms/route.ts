import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logCrmEvent } from "@/lib/crm";

export const dynamic = "force-dynamic";

// 📲 Telnyx inbound SMS/MMS webhook (Jon 2026-10-08 — the pre-Nov-7 block):
// seller texts land in Conversations IN REAL TIME instead of the 5×/day GHL
// sync, inbound photos arrive as media URLs (threads already render them as
// images), STOP/hostile replies DNC instantly, and delivery failures mark the
// outbound event. Set as the webhook on the "War Room SMS" messaging profile.
export async function POST(req: NextRequest) {
  let body: { data?: { event_type?: string; payload?: Record<string, unknown> } };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const ev = body.data?.event_type ?? "";
  const p = (body.data?.payload ?? {}) as {
    id?: string; direction?: string; text?: string;
    from?: { phone_number?: string } | string;
    to?: Array<{ phone_number?: string; status?: string }>;
    media?: Array<{ url?: string }>;
    errors?: Array<{ title?: string }>;
  };

  if (ev === "message.received" && p.direction === "inbound") {
    const fromNum = typeof p.from === "string" ? p.from : p.from?.phone_number ?? "";
    const last10 = fromNum.replace(/\D/g, "").slice(-10);
    if (last10.length !== 10) return NextResponse.json({ ok: true });
    const msgId = String(p.id ?? "");
    // dedupe (Telnyx retries webhooks)
    if (msgId) {
      const dup = await db.crmEvent.findFirst({ where: { meta: { path: ["msgId"], equals: msgId } }, select: { id: true } }).catch(() => null);
      if (dup) return NextResponse.json({ ok: true, dup: true });
    }
    let contact = await db.crmContact.findFirst({ where: { phone: { contains: last10 } }, select: { id: true, assignedTo: true, tags: true, name: true } });
    if (!contact) {
      contact = await db.crmContact.create({
        data: { name: fromNum, phone: `+1${last10}`, source: "Inbound text", assignedTo: "" },
        select: { id: true, assignedTo: true, tags: true, name: true },
      });
    }
    const text = String(p.text ?? "").slice(0, 900);
    const mediaUrls = (p.media ?? []).map((m) => m.url).filter(Boolean) as string[];
    const bodyTxt = [text, ...mediaUrls].filter(Boolean).join("\n") || "(empty message)";
    const opp = await db.crmOpportunity.findFirst({ where: { contactId: contact.id, archivedAt: null }, select: { id: true } });
    await logCrmEvent({
      contactId: contact.id, oppId: opp?.id ?? "", kind: "sms",
      body: `⬅️ Seller: ${bodyTxt}`,
      meta: { msgId, dir: "inbound", via: "telnyx", ...(mediaUrls.length ? { media: mediaUrls } : {}) },
      actor: "inbound-sms",
    }).catch(() => {});
    // 🚫 real-time STOP / hostile guard
    try {
      const { DNC_REGEX, dncContact } = await import("@/lib/crm-dnc");
      if (DNC_REGEX.test(text)) await dncContact(contact.id, `inbound text matched the STOP/hostile filter: "${text.slice(0, 80)}"`);
    } catch { /* guard never breaks intake */ }
    // 📣 nudge the owner: a task so the reply never slips (dup-guarded per day)
    try {
      if (contact.assignedTo && !/\bdnc\b|\bdnd_all\b/i.test(contact.tags)) {
        const today = new Date().toISOString().slice(0, 10);
        const title = `💬 ${contact.name.split(" ")[0]} texted back — reply (${fromNum})`;
        const dup = await db.crmTask.findFirst({ where: { title, doneAt: null } });
        if (!dup) await db.crmTask.create({ data: { contactId: contact.id, oppId: opp?.id ?? "", title, due: today, assignedTo: contact.assignedTo, createdBy: "inbound-sms" } });
      }
    } catch { /* best-effort */ }
    return NextResponse.json({ ok: true });
  }

  // outbound delivery reports: stamp failures onto the last matching send
  if (ev === "message.finalized" && p.direction === "outbound") {
    const status = p.to?.[0]?.status ?? "";
    if (["delivery_failed", "sending_failed", "failed", "undelivered"].includes(status)) {
      const toNum = p.to?.[0]?.phone_number ?? "";
      const last10 = toNum.replace(/\D/g, "").slice(-10);
      const contact = last10.length === 10 ? await db.crmContact.findFirst({ where: { phone: { contains: last10 } }, select: { id: true } }) : null;
      if (contact) {
        const err = p.errors?.[0]?.title ?? status;
        await logCrmEvent({ contactId: contact.id, oppId: "", kind: "sms", body: `⚠️ Text NOT delivered (${err}) — carrier rejected it; try calling or rotate the from-number.`, meta: { msgId: `dlr-${p.id}` }, actor: "telnyx-dlr" }).catch(() => {});
      }
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
