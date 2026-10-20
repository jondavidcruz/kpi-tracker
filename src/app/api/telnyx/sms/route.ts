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
    let wasDnced = false, declined = false;
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
    // 🚫 Classify the reply (Jon 2026-10-20): STOP/hostile/cussing → DNC + off the
    // list; a civil "no / not interested / not selling" → move the lead to a
    // Not-Interested stage (NOT a full DNC); anything else → a reply task.
    try {
      const { DNC_REGEX, dncContact } = await import("@/lib/crm-dnc");
      const DECLINE_REGEX = /\b(not\s*(interested|selling)|no\s*thank|already\s*sold|we\s*sold|don'?t\s*(want|wish|need)\s*to\s*sell|\bpass\b)\b|^\s*(no|nope)\b[.! ]*$/i;
      if (DNC_REGEX.test(text)) { wasDnced = true; await dncContact(contact.id, `inbound text matched the STOP/hostile filter: "${text.slice(0, 80)}"`); }
      else if (DECLINE_REGEX.test(text)) { declined = true; }
      else if (text.length >= 12) {
        // 🤖 AI screen — one call, three buckets.
        try {
          const { aiText } = await import("@/lib/ai");
          const verdict = await aiText({
            maxTokens: 6,
            messages: [{ role: "user", content: `A homeowner replied to a real-estate investor's text:\n"""${text.slice(0, 400)}"""\nClassify their intent in ONE word:\nSTOP = demands we stop contacting, hostile/abusive/cussing, or "remove me from the list".\nDECLINE = simply not interested / not selling / already sold, but not hostile.\nREPLY = anything else (a question, interest, price, neutral).\nAnswer with exactly one word: STOP, DECLINE, or REPLY.` }],
          });
          if (/stop/i.test(verdict)) { wasDnced = true; await dncContact(contact.id, `AI screen — seller said stop/hostile: "${text.slice(0, 80)}"`); }
          else if (/decline/i.test(verdict)) { declined = true; }
        } catch { /* screen is best-effort; the rep task still fires */ }
      }
      // 📴 Civil decline → move the opp to a Not-Interested (or dead/nurture) stage + tag.
      if (declined && opp) {
        const { readPipelines } = await import("@/lib/crm");
        const pls = await readPipelines();
        const pl = pls.find((x) => x.name === (opp.pipeline || "War Room")) ?? pls[0];
        const match = (rx: RegExp) => pl?.stages.find((s) => rx.test(`${s.key} ${s.label}`));
        const target = match(/not.?interest|no.?interest/i) ?? match(/\bdead\b|lost/i) ?? match(/nurture/i);
        const tags = /not-interested/i.test(opp.tags || "") ? (opp.tags || "") : [opp.tags, "not-interested"].filter(Boolean).join(",");
        await db.crmOpportunity.update({ where: { id: opp.id }, data: { ...(target && target.key !== opp.stage ? { stage: target.key } : {}), tags } }).catch(() => {});
        await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: `📴 Seller replied not interested${target ? ` → moved to "${target.label}"` : ""}: "${text.slice(0, 60)}"`, actor: "inbound-sms" }).catch(() => {});
      }
    } catch { /* guard never breaks intake */ }
    // 📣 nudge the owner only if they're actually engaged (dup-guarded per day)
    try {
      if (!wasDnced && !declined && contact.assignedTo && !/\bdnc\b|\bdnd_all\b/i.test(contact.tags)) {
        const today = new Date().toISOString().slice(0, 10);
        const title = `💬 ${contact.name.split(" ")[0]} texted back — reply (${fromNum})`;
        const dup = await db.crmTask.findFirst({ where: { title, doneAt: null } });
        if (!dup) await db.crmTask.create({ data: { contactId: contact.id, oppId: opp?.id ?? "", title, due: today, assignedTo: contact.assignedTo, createdBy: "inbound-sms" } });
      }
    } catch { /* best-effort */ }
    // 📲 push to the installed iPhone/desktop app: assigned rep, else everyone
    try {
      if (wasDnced) return NextResponse.json({ ok: true, dnc: true });
      const { sendPushTo } = await import("@/lib/push");
      const who = contact.assignedTo ? [contact.assignedTo.split(" ")[0]] : ("all" as const);
      sendPushTo(who, { title: `💬 ${contact.name}`, body: text.slice(0, 120) || "📷 picture message", url: `/crm/conversations?c=${contact.id}`, tag: `sms-${contact.id}` }).catch(() => {});
    } catch { /* push is best-effort */ }
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
