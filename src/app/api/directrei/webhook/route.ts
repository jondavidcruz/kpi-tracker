import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { logCrmEvent, readPipelines } from "@/lib/crm";
import { normalizeAddress } from "@/lib/address";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 📨 Direct REI → War Room webhook (Jon 2026-10-09): point Direct REI's
// Settings → API & Zapier → Add webhook at
//   https://kpi-tracker-lovat.vercel.app/api/directrei/webhook?k=<shared key>
// contact.qualified → the seller lands in MICHELLE's pipeline as a new lead
// with a CALL NOW task; contact.opted_out (sms) → straight to DNC. The old
// setup posted raw events at a Google Chat webhook, which can only accept
// {text} — that's why every delivery failed.
const MICHELLE = "Michelle Lagudas";

function sharedKey() {
  return crypto.createHash("sha256").update(`${process.env.CRON_SECRET ?? ""}drei-webhook`).digest("hex").slice(0, 24);
}

function verifySignature(secret: string, header: string, rawBody: string): boolean {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header || "");
  if (!m) return false;
  if (Math.abs(Date.now() / 1000 - Number(m[1])) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${m[1]}.${rawBody}`).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(m[2])); } catch { return false; }
}

type DreiContact = {
  id?: string; name?: string; email?: string; phone?: string; role?: string; status?: string;
  market?: string; tags?: string[]; source?: string;
  mailing_street?: string; mailing_city?: string; mailing_state?: string; mailing_zip?: string;
};

export async function POST(req: NextRequest) {
  const raw = await req.text();
  // auth: the ?k= shared key in the URL, or (when DREI_WEBHOOK_SECRET is set)
  // Direct REI's own HMAC signature — either one admits the delivery.
  const k = req.nextUrl.searchParams.get("k") ?? "";
  const sig = req.headers.get("x-drei-signature") ?? "";
  const sigOk = !!process.env.DREI_WEBHOOK_SECRET && verifySignature(process.env.DREI_WEBHOOK_SECRET, sig, raw);
  if (k !== sharedKey() && !sigOk) return NextResponse.json({ error: "bad key" }, { status: 401 });

  let body: { event?: string; data?: DreiContact; channel?: string; previous_status?: string } = {};
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const ev = body.event ?? "";
  const d = body.data ?? {};
  const phone = (d.phone ?? "").replace(/[^+\d]/g, "");
  const last10 = phone.replace(/\D/g, "").slice(-10);
  const email = (d.email ?? "").trim().toLowerCase();

  // find the contact however we can — phone first, then email
  const existing = last10.length === 10 || email
    ? await db.crmContact.findFirst({ where: { OR: [...(last10.length === 10 ? [{ phone: { contains: last10 } }] : []), ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : [])] } })
    : null;

  if (ev === "contact.opted_out") {
    if (existing) {
      const { dncContact } = await import("@/lib/crm-dnc");
      await dncContact(existing.id, `Direct REI opt-out (${body.channel ?? "sms"})`).catch(() => {});
    }
    return NextResponse.json({ ok: true, handled: "opted_out" });
  }

  if (ev !== "contact.qualified") return NextResponse.json({ ok: true, ignored: ev }); // 2xx so deliveries never "fail"

  const addr = normalizeAddress([d.mailing_street, d.mailing_city, `${d.mailing_state ?? ""} ${d.mailing_zip ?? ""}`.trim()].filter(Boolean).map((s) => String(s).trim()).filter(Boolean).join(", "));
  const title = addr || `${d.name ?? "Direct REI seller"}${d.market ? ` — ${d.market}` : ""}`;

  let contact = existing;
  if (!contact) {
    contact = await db.crmContact.create({ data: {
      name: (d.name ?? "").trim() || phone || email || "Direct REI seller",
      phone: phone ? (phone.startsWith("+") ? phone : `+1${last10}`) : "",
      email, address: addr,
      source: `Direct REI${d.market ? ` (${d.market})` : ""}`,
      assignedTo: MICHELLE,
    } });
  }

  // one live opp per contact: reuse it if it exists, otherwise drop a fresh
  // card at the top of Michelle's pipeline
  let opp = await db.crmOpportunity.findFirst({ where: { contactId: contact.id, archivedAt: null } });
  if (!opp) {
    const pipe = (await readPipelines()).find((p) => p.name.toLowerCase().includes("michelle"));
    opp = await db.crmOpportunity.create({ data: {
      contactId: contact.id, title, stage: pipe?.stages[0]?.key ?? "new", pipeline: pipe?.name ?? "", assignedTo: MICHELLE,
    } });
  }
  await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: `⭐ Direct REI marked this seller QUALIFIED${body.previous_status ? ` (was: ${body.previous_status})` : ""} — auto-routed to ${MICHELLE}`, actor: "directrei" }).catch(() => {});
  await db.crmTask.create({ data: { contactId: contact.id, title: `⭐ QUALIFIED by Direct REI — call ${contact.name} NOW`, due: new Date().toISOString().slice(0, 10), assignedTo: MICHELLE, createdBy: "directrei" } }).catch(() => {});
  await db.crmOpportunity.update({ where: { id: opp.id }, data: { updatedAt: new Date() } }).catch(() => {});
  return NextResponse.json({ ok: true, contactId: contact.id, oppId: opp.id, created: !existing });
}
