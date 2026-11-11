import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logCrmEvent } from "@/lib/crm";

export const dynamic = "force-dynamic";

// ✉️ Inbound EMAIL reply webhook (Jon 2026-11-11: "if anyone replies via email ... it'll stop the
// automation and move them out of the pipeline"). Mirrors the inbound-SMS route: a seller's email
// reply stops the drip sequence, moves the lead forward (price → Comp/Offer, else → Follow Up),
// DNCs on STOP/hostile, and drops a "call them now" task with the discovery checklist.
//
// CONNECT (one-time, Jon): point your mail provider's inbound/forward at
//   https://kpi-tracker-lovat.vercel.app/api/email/inbound?key=YOUR_SECRET
// where YOUR_SECRET = the CRON_SECRET (or set INBOUND_EMAIL_SECRET). Works with Resend Inbound,
// a Cloudflare Email Worker, Zapier "new email → webhook", or any forward that POSTs JSON.
// Accepts Resend's { data: { from, subject, text } } shape and a generic { from, subject, text }.

function extractEmail(from: unknown): string {
  if (!from) return "";
  if (typeof from === "object") {
    const o = from as { address?: string; email?: string };
    if (o.address) return o.address.trim().toLowerCase();
    if (o.email) return o.email.trim().toLowerCase();
  }
  const m = String(from).match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0].trim().toLowerCase() : "";
}

// Keep only the NEW text a seller typed — drop the quoted thread/signature so classification reads
// their actual reply, not our original message bounced back.
function topOfReply(raw: string): string {
  const lines = String(raw || "").replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const ln of lines) {
    if (/^\s*>/.test(ln)) break;                                   // quoted line
    if (/^\s*On .+wrote:\s*$/i.test(ln)) break;                    // "On <date> <name> wrote:"
    if (/^\s*-{2,}\s*Original Message/i.test(ln)) break;
    if (/^\s*From:\s.+@/i.test(ln)) break;                         // forwarded header block
    out.push(ln);
  }
  return out.join("\n").trim().slice(0, 1200) || String(raw || "").trim().slice(0, 1200);
}

export async function POST(req: NextRequest) {
  // 🔐 shared-secret gate (if one is configured). Accept ?key= matching CRON_SECRET or
  // INBOUND_EMAIL_SECRET; if neither is set, still process so it works on first connect.
  const secret = process.env.INBOUND_EMAIL_SECRET || process.env.CRON_SECRET || "";
  if (secret) {
    const key = req.nextUrl.searchParams.get("key") || req.headers.get("x-webhook-secret") || "";
    if (key !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Parse JSON (preferred) or form-encoded.
  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    try { const fd = await req.formData(); fd.forEach((v, k) => { payload[k] = typeof v === "string" ? v : ""; }); }
    catch { return NextResponse.json({ ok: false, error: "bad payload" }, { status: 400 }); }
  }
  // Resend wraps the message in `data`; generic forwards are flat.
  const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;

  const fromEmail = extractEmail(data.from ?? data.sender ?? data.From);
  if (!fromEmail) return NextResponse.json({ ok: true, skipped: "no sender email" });
  const subject = String(data.subject ?? data.Subject ?? "").slice(0, 300);
  const rawText = String(data.text ?? data.text_plain ?? data["stripped-text"] ?? data.plain ?? data.body ?? "");
  const text = topOfReply(rawText) || subject || "(empty email)";
  const msgId = String(data.message_id ?? data.messageId ?? data["Message-Id"] ?? data.id ?? "");

  // Dedupe (providers retry).
  if (msgId) {
    const dup = await db.crmEvent.findFirst({ where: { meta: { path: ["msgId"], equals: msgId } }, select: { id: true } }).catch(() => null);
    if (dup) return NextResponse.json({ ok: true, dup: true });
  }

  // Match the seller by email; create a lightweight contact if this is a brand-new sender.
  let contact = await db.crmContact.findFirst({ where: { email: { equals: fromEmail, mode: "insensitive" } }, select: { id: true, assignedTo: true, tags: true, name: true } }).catch(() => null);
  if (!contact) {
    contact = await db.crmContact.create({
      data: { name: fromEmail, email: fromEmail, source: "Inbound email", assignedTo: "" },
      select: { id: true, assignedTo: true, tags: true, name: true },
    }).catch(() => null);
  }
  if (!contact) return NextResponse.json({ ok: false, error: "contact" }, { status: 500 });

  const opp = await db.crmOpportunity.findFirst({ where: { contactId: contact.id, archivedAt: null }, select: { id: true, pipeline: true, stage: true, tags: true } });

  await logCrmEvent({
    contactId: contact.id, oppId: opp?.id ?? "", kind: "email",
    body: `⬅️ Seller: ${subject ? `${subject} — ` : ""}${text}`.slice(0, 1600),
    meta: { msgId, dir: "inbound", via: "email" },
    actor: "inbound-email",
  }).catch(() => {});

  // 📨 Shared reply-brain: stop drip, forward-only stage move, discovery-checklist task.
  const { routeSellerReply } = await import("@/lib/inbound-reply");
  const flags = await routeSellerReply({ channel: "email", text, contact: { id: contact.id, name: contact.name, assignedTo: contact.assignedTo, tags: contact.tags }, opp, contactInfo: fromEmail });

  // 📲 push the rep (skip DNC / not-interested / realtor — those are auto-snoozed).
  try {
    if (!flags.wasDnced && !flags.declined && !flags.realtor && contact.assignedTo && !/\bdnc\b|\bdnd_all\b/i.test(contact.tags || "")) {
      const { sendPushTo } = await import("@/lib/push");
      const who = contact.assignedTo ? [contact.assignedTo.split(" ")[0]] : ("all" as const);
      sendPushTo(who, { title: `${flags.qualified ? "✅ " : "✉️ "}${contact.name}`, body: text.slice(0, 120), url: `/crm/conversations?c=${contact.id}`, tag: `email-${contact.id}` }).catch(() => {});
    }
  } catch { /* push is best-effort */ }

  return NextResponse.json({ ok: true, dnc: flags.wasDnced });
}
