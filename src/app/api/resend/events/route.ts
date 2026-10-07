import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { logCrmEvent } from "@/lib/crm";

export const dynamic = "force-dynamic";

// Resend event webhook → "👀 opened / 🔗 clicked" rows on the lead timeline
// (HubSpot-style engagement signals). Registered by ?resendhook=1, which
// stores the svix signing secret in Resource __resend_hook__.
async function signingSecret(): Promise<string> {
  const row = await db.resource.findFirst({ where: { category: "__resend_hook__" } }).catch(() => null);
  try { return row?.description ? (JSON.parse(row.description).secret ?? "") : ""; } catch { return ""; }
}

function verifySvix(secret: string, id: string, ts: string, payload: string, sigHeader: string): boolean {
  try {
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = crypto.createHmac("sha256", key).update(`${id}.${ts}.${payload}`).digest("base64");
    return sigHeader.split(" ").some((part) => {
      const sig = part.includes(",") ? part.split(",")[1] : part;
      try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { return false; }
    });
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const secret = await signingSecret();
  if (secret) {
    const ok = verifySvix(secret, req.headers.get("svix-id") ?? "", req.headers.get("svix-timestamp") ?? "", payload, req.headers.get("svix-signature") ?? "");
    if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
  }
  let body: { type?: string; data?: { email_id?: string; to?: string[] | string; subject?: string; click?: { link?: string } } };
  try { body = JSON.parse(payload); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const type = body.type ?? "";
  if (!["email.opened", "email.clicked", "email.bounced", "email.complained"].includes(type)) return NextResponse.json({ ok: true });
  const to = Array.isArray(body.data?.to) ? body.data?.to[0] : body.data?.to;
  if (!to) return NextResponse.json({ ok: true });
  const contact = await db.crmContact.findFirst({ where: { email: { equals: to, mode: "insensitive" } }, select: { id: true } });
  if (!contact) return NextResponse.json({ ok: true });
  const marker = `rs-${body.data?.email_id ?? ""}-${type}`;
  const dup = await db.crmEvent.findFirst({ where: { contactId: contact.id, meta: { path: ["msgId"], equals: marker } }, select: { id: true } }).catch(() => null);
  if (dup) return NextResponse.json({ ok: true });
  const opp = await db.crmOpportunity.findFirst({ where: { contactId: contact.id, archivedAt: null }, orderBy: { updatedAt: "desc" }, select: { id: true } });
  const text = type === "email.opened" ? `👀 Opened our email${body.data?.subject ? `: “${body.data.subject}”` : ""} — they're reading. Good time to call.`
    : type === "email.clicked" ? `🔗 Clicked a link in our email${body.data?.click?.link ? ` (${body.data.click.link.slice(0, 80)})` : ""} — HOT signal.`
    : type === "email.bounced" ? "⚠️ Email bounced — this address looks bad; try the phone."
    : "🚫 Marked our email as spam — stop emailing this lead.";
  await logCrmEvent({ contactId: contact.id, oppId: opp?.id, kind: "email", body: text, meta: { msgId: marker, via: "resend" }, actor: "resend" });
  return NextResponse.json({ ok: true });
}
