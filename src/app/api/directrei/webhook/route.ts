import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
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
  const { upsertDreiHotLead, dreiLeadsOn, logDreiWebhook, recordDreiResponse } = await import("@/lib/directrei-leads");
  // 📨 log every authenticated delivery so we can SEE what Direct REI actually sends.
  await logDreiWebhook({ event: ev, status: d.status ?? "", name: d.name ?? "", phone: last10, channel: body.channel ?? "" });

  // 📊 Campaign Health (Jon 2026-11-12): record EVERY campaign response by ZIP so Market Finder can
  // show per-campaign reply/interested/priced/opt-out health attributed to each uploaded pull list.
  try {
    const zMatch = String(d.mailing_zip ?? "").match(/\d{5}/) ?? String(d.market ?? "").match(/\d{5}/);
    const zip = zMatch ? zMatch[0] : "";
    if (zip) {
      const st = `${ev} ${d.status ?? ""}`.toLowerCase();
      const noteTxt = String((body as Record<string, unknown>).notes ?? (body as Record<string, unknown>).ai_summary ?? (body as Record<string, unknown>).message ?? "");
      const hasPrice = /\$[\d,]{3,}|asking|would take|willing to/i.test(noteTxt);
      const type = /opt.?out|unsub|opted_out|\bdnc\b|\bstop\b/.test(st) ? "optedOut"
        : /not.?interest|no.?interest|declin|dead/.test(st) ? "notInterested"
        : hasPrice ? "priced"
        : /qualif|interest|hot|ready/.test(st) ? "interested"
        : "replied";
      await recordDreiResponse(zip, type as "replied" | "interested" | "priced" | "notInterested" | "optedOut");
    }
  } catch { /* health tracking never blocks the webhook */ }

  // find the contact however we can — phone first, then email
  const existing = last10.length === 10 || email
    ? await db.crmContact.findFirst({ where: { OR: [...(last10.length === 10 ? [{ phone: { contains: last10 } }] : []), ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : [])] } })
    : null;

  if (/opt.?out|unsub|opted_out|dnc|stop/i.test(ev)) {
    if (existing) {
      const { dncContact } = await import("@/lib/crm-dnc");
      await dncContact(existing.id, `Direct REI opt-out (${body.channel ?? "sms"})`).catch(() => {});
    }
    return NextResponse.json({ ok: true, handled: "opted_out" });
  }

  // 🔥 Treat as a hot lead when Direct REI qualifies a seller OR a reply/status event shows
  // interest/a price. Broadened from just "contact.qualified" so we catch however Direct REI
  // names it (Jon 2026-11-05: webhook should pull replies in INSTANTLY, no daily schedule).
  const status = String(d.status ?? "").toLowerCase();
  const bodyAny = body as Record<string, unknown>;
  const notes = String(bodyAny.notes ?? bodyAny.summary ?? bodyAny.ai_summary ?? bodyAny.message ?? bodyAny.ai_reply ?? "").trim();
  const qualifies = /qualif/i.test(ev)
    || (/replied|reply|status|interest|hot|action/i.test(ev) && /qualif|ready|interest|price|hot|action|replied/i.test(status))
    || /\$[\d,]{3,}|asking|per ?sqft|would take|willing to/i.test(notes);
  if (!qualifies) return NextResponse.json({ ok: true, ignored: ev, status }); // 2xx so deliveries never "fail"

  // 🛑 Lead creation is OFF unless enabled (env DIRECTREI_LEADS=on OR the in-app toggle).
  if (!(await dreiLeadsOn())) return NextResponse.json({ ok: true, handled: "directrei-disabled", hint: "enable DirectREI auto-leads in Settings" });

  const addr = normalizeAddress([d.mailing_street, d.mailing_city, `${d.mailing_state ?? ""} ${d.mailing_zip ?? ""}`.trim()].filter(Boolean).map((s) => String(s).trim()).filter(Boolean).join(", "));
  const price = (notes.match(/\$[\d,]+(?:\.\d+)?/) ?? [])[0] ?? String(bodyAny.price ?? "");
  const r = await upsertDreiHotLead({ name: d.name, phone, email, market: d.market, address: addr, status: d.status, notes, price });
  // 🆕 Real-time chat post when a NEW lead actually lands (Jon 2026-11-05: replaced the
  // daily digest with a live "new lead came in" ping). created=true means a fresh qualified
  // lead (not a recent dupe). Internal team chat post — fire-and-forget, never blocks the 2xx.
  if (r?.created) {
    const { postToSpace } = await import("@/lib/chat-spaces");
    const roleTxt = /buy/i.test(d.role ?? "") ? "buyer" : "seller";
    const whereTxt = addr || d.market || "";
    const reach = phone || email || "";
    postToSpace("directrei", `🆕 *New Direct REI ${roleTxt}* — ${d.name || "Unknown"}${whereTxt ? ` · ${whereTxt}` : ""}${price ? ` · ${price}` : ""} — replied & auto-landed in the CRM${roleTxt === "seller" ? " (→ Michelle)" : ""}.${reach ? ` ${reach}` : ""}`).catch(() => {});
  }
  return NextResponse.json({ ok: true, ...(r ?? { skipped: "no phone/email" }) });
}
