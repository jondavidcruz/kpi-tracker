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
    const opp = await db.crmOpportunity.findFirst({ where: { contactId: contact.id, archivedAt: null }, select: { id: true, pipeline: true, stage: true, tags: true } });
    await logCrmEvent({
      contactId: contact.id, oppId: opp?.id ?? "", kind: "sms",
      body: `⬅️ Seller: ${bodyTxt}`,
      meta: { msgId, dir: "inbound", via: "telnyx", line: p.to?.[0]?.phone_number ?? "", ...(mediaUrls.length ? { media: mediaUrls } : {}) },
      actor: "inbound-sms",
    }).catch(() => {});
    // 📨 Classify + route the reply through the shared brain (same logic for text & email): DNC /
    // decline → Dead / realtor snooze / qualified, forward-only stage move (price → Comp/Offer, else
    // → Follow Up), STOP the drip, and drop a "call them now" task with the discovery checklist.
    const { routeSellerReply } = await import("@/lib/inbound-reply");
    const flags = await routeSellerReply({ channel: "sms", text, contact: { id: contact.id, name: contact.name, assignedTo: contact.assignedTo, tags: contact.tags }, opp, contactInfo: fromNum });
    const { wasDnced, declined, realtor, qualified } = flags;
    // 📲 push to the installed iPhone/desktop app: assigned rep, else everyone
    try {
      if (wasDnced) return NextResponse.json({ ok: true, dnc: true });
      // auto-snoozed (not-interested / realtor) → no push; qualified/neutral → push the rep.
      if (!declined && !realtor && contact.assignedTo && !/\bdnc\b|\bdnd_all\b/i.test(contact.tags)) {
        const { sendPushTo } = await import("@/lib/push");
        const who = contact.assignedTo ? [contact.assignedTo.split(" ")[0]] : ("all" as const);
        sendPushTo(who, { title: `${qualified ? "✅ " : "💬 "}${contact.name}`, body: text.slice(0, 120) || "📷 picture message", url: `/crm/conversations?c=${contact.id}`, tag: `sms-${contact.id}` }).catch(() => {});
      }
    } catch { /* push is best-effort */ }
    return NextResponse.json({ ok: true });
  }

  // outbound delivery reports: stamp failures onto the last matching send
  if (ev === "message.finalized" && p.direction === "outbound") {
    const status = p.to?.[0]?.status ?? "";
    if (["delivery_failed", "sending_failed", "failed", "undelivered"].includes(status)) {
      const toNum = p.to?.[0]?.phone_number ?? "";
      const failedFrom = typeof p.from === "string" ? p.from : p.from?.phone_number ?? "";
      const text = String(p.text ?? "");
      const last10 = toNum.replace(/\D/g, "").slice(-10);
      const contact = last10.length === 10 ? await db.crmContact.findFirst({ where: { phone: { contains: last10 } }, select: { id: true } }) : null;
      // 🔄 Auto-rotate the from-number (Jon 2026-10-26): a carrier rejection on a ported
      // number auto-resends from the next known-good War Room number instead of failing.
      const { rotateAndResend } = await import("@/lib/sms-rotate");
      const rot = text ? await rotateAndResend(toNum, text, failedFrom).catch(() => ({ resent: false })) : { resent: false };
      if (contact) {
        const err = p.errors?.[0]?.title ?? status;
        const body = "resent" in rot && rot.resent
          ? `🔄 ${failedFrom || "That number"} was rejected (${err}) — automatically resent from ${(rot as { from?: string }).from}.`
          : "exhausted" in rot && rot.exhausted
          ? `⚠️ Text undeliverable after trying multiple numbers (${err}) — call them instead.`
          : `⚠️ Text NOT delivered (${err}) — carrier rejected it; try calling or rotate the from-number.`;
        await logCrmEvent({ contactId: contact.id, oppId: "", kind: "sms", body, meta: { msgId: `dlr-${p.id}` }, actor: "telnyx-dlr" }).catch(() => {});
      }
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
