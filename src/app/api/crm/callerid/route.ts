import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { isDispoNetworkPipeline } from "@/lib/dispo-buyers";

export const dynamic = "force-dynamic";

// 🏷 Which side of the business is this caller? (Jon 2026-10-23: "note on the
// caller ID whether it's a dispo contact or an acquisitions contact calling in").
// A developer / buyer-agent (dispo buyer-NETWORK pipeline) → Dispositions.
// Everyone else we track is a seller → Acquisitions. No opp at all → unknown.
async function contactDept(contactId: string): Promise<{ dept: "" | "dispo" | "acquisitions"; label: string }> {
  if (!contactId) return { dept: "", label: "" };
  const opps = await db.crmOpportunity
    .findMany({ where: { contactId, archivedAt: null }, select: { pipeline: true } })
    .catch(() => [] as { pipeline: string | null }[]);
  if (!opps.length) return { dept: "", label: "" };
  const isBuyer = opps.some((o) => isDispoNetworkPipeline(o.pipeline));
  return isBuyer
    ? { dept: "dispo", label: "🤝 Dispo · buyer" }
    : { dept: "acquisitions", label: "🏠 Acquisitions · seller" };
}

// ☎️ Caller-ID helper for the dialer (Jon 2026-10-12):
// ?num=+19093956195 → who that is in the CRM (name on the incoming banner)
// ?last=1           → who on the team answered the most recent inbound call
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ error: "no access" }, { status: 403 });

  if (req.nextUrl.searchParams.get("last") === "1") {
    const row = await db.resource.findFirst({ where: { category: "__last_answer__" } });
    let d: { at?: string; agent?: string; from?: string; callerName?: string } = {};
    try { d = row?.description ? JSON.parse(row.description) : {}; } catch { /* none */ }
    return NextResponse.json(d, { headers: { "Cache-Control": "private, no-store" } });
  }

  // ?claim=1 → is there a fresh "answer it on my line" request? (cross-profile)
  if (req.nextUrl.searchParams.get("claim") === "1") {
    const row = await db.resource.findFirst({ where: { category: "__ring_claim__" } });
    let d: { at?: string; agent?: string } = {};
    try { d = row?.description ? JSON.parse(row.description) : {}; } catch { /* none */ }
    return NextResponse.json(d, { headers: { "Cache-Control": "private, no-store" } });
  }

  const num = req.nextUrl.searchParams.get("num") ?? "";
  const last10 = num.replace(/\D/g, "").slice(-10);
  if (last10.length !== 10) return NextResponse.json({ name: "" });
  const c = await db.crmContact.findFirst({ where: { phone: { contains: last10 } }, select: { id: true, name: true, address: true } });
  const { dept, label: deptLabel } = c?.id ? await contactDept(c.id) : { dept: "" as const, label: "" };
  return NextResponse.json({ name: c?.name ?? "", id: c?.id ?? "", address: c?.address ?? "", dept, deptLabel }, { headers: { "Cache-Control": "private, no-store" } });
}

// POST → "answer the ringing call on MY line" — written when someone clicks
// Answer on a banner whose browser doesn't hold their phone (Jon 2026-10-12:
// Sharyn's click couldn't reach her other profile). Her ringing client polls
// ?claim=1 and auto-answers when it sees her name.
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ error: "no access" }, { status: 403 });
  const first = me!.name.split(" ")[0].toLowerCase();
  const payload = JSON.stringify({ at: new Date().toISOString(), agent: first });
  const row = await db.resource.findFirst({ where: { category: "__ring_claim__" } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: payload } });
  else await db.resource.create({ data: { title: "ring-claim", category: "__ring_claim__", url: "", description: payload } });
  // 🔁 RE-RING the claimer (Jon 2026-10-12, Sharyn): her old registration never
  // answers, so her clicking tab takes over the credential and we dial a FRESH
  // leg at it — the tab auto-answers. Works from any machine, any profile.
  try {
    if (process.env.TELNYX_API_KEY) {
      const sessRow = await db.resource.findFirst({ where: { category: "__ring_sessions__" } });
      const sessMap = (sessRow?.description ? JSON.parse(sessRow.description) : {}) as Record<string, { legs: string[]; answered: boolean; at: string; from?: string }>;
      const entry = Object.entries(sessMap).find(([, v]) => !v.answered && Date.now() - Date.parse(v.at) < 32_000);
      const cfgRow = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } });
      const cfg = (cfgRow?.description ? JSON.parse(cfgRow.description) : {}) as { ccAppId?: string; agents?: Record<string, { sipUser?: string }> };
      const sip = cfg.agents?.[first]?.sipUser;
      if (entry && sip && cfg.ccAppId) {
        const [inId, sess] = entry;
        const clientState = Buffer.from(JSON.stringify({ ring: inId })).toString("base64");
        const r = await fetch("https://api.telnyx.com/v2/calls", {
          method: "POST", headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ connection_id: cfg.ccAppId, to: `sip:${sip}@sip.telnyx.com`, from: sess.from || "+18302100552", timeout_secs: 25, client_state: clientState }),
        });
        const rb = (await r.json().catch(() => ({}))) as { data?: { call_control_id?: string } };
        if (rb.data?.call_control_id) {
          sess.legs.push(rb.data.call_control_id);
          if (sessRow) await db.resource.update({ where: { id: sessRow.id }, data: { description: JSON.stringify(sessMap) } });
          return NextResponse.json({ ok: true, rering: true });
        }
      }
    }
  } catch { /* claim poll still covers the same-machine case */ }
  return NextResponse.json({ ok: true });
}
