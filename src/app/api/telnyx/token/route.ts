import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Browser-dialer bootstrap (Jon 2026-10-07: "call from Chrome, not my cell").
// Self-provisions once: Credential Connection → Outbound Voice Profile →
// telephony credential, all saved in Resource __telnyx_webrtc__; then every
// request mints a short-lived WebRTC login token for the signed-in rep.
const CAT = "__telnyx_webrtc__";
const TX = "https://api.telnyx.com/v2";

async function tx(path: string, init?: RequestInit) {
  const res = await fetch(`${TX}${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const text = await res.text();
  let body: unknown; try { body = JSON.parse(text); } catch { body = text; }
  return { ok: res.ok, status: res.status, body, text };
}

export async function POST() {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ error: "no access" }, { status: 403 });
  if (!process.env.TELNYX_API_KEY) return NextResponse.json({ error: "TELNYX_API_KEY missing in Vercel" }, { status: 500 });

  const row = await db.resource.findFirst({ where: { category: CAT } });
  let cfg: { connId?: string; credId?: string; callerId?: string } = {};
  try { cfg = row?.description ? JSON.parse(row.description) : {}; } catch { /* fresh */ }

  try {
    // 1) credential connection (the SIP identity browsers log into)
    if (!cfg.connId) {
      const user = `warroom${Math.random().toString(36).slice(2, 10)}`;
      const pass = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const r = await tx("/credential_connections", { method: "POST", body: JSON.stringify({ connection_name: "War Room Browser Dialer", user_name: user, password: pass, webrtc: true }) });
      const b = r.body as { data?: { id?: string } };
      if (!r.ok || !b.data?.id) return NextResponse.json({ error: `Telnyx refused the connection setup (${r.status}): ${r.text.slice(0, 180)}` }, { status: 502 });
      cfg.connId = b.data.id;
    }
    // 2) outbound voice profile wired to it (needed to dial out)
    if (!cfg.callerId) {
      const prof = await tx("/outbound_voice_profiles", { method: "POST", body: JSON.stringify({ name: "War Room Browser Dialer", traffic_type: "conversational" }) });
      const pb = prof.body as { data?: { id?: string } };
      if (pb.data?.id) await tx(`/credential_connections/${cfg.connId}`, { method: "PATCH", body: JSON.stringify({ outbound: { outbound_voice_profile_id: pb.data.id } }) });
      // caller id: env wins, else first owned number
      let caller = process.env.TELNYX_CALLER_ID ?? "";
      if (!caller) {
        const nums = await tx("/phone_numbers?page[size]=1");
        const nb = nums.body as { data?: Array<{ phone_number?: string }> };
        caller = nb.data?.[0]?.phone_number ?? "";
      }
      cfg.callerId = caller;
    }
    // 3) telephony credential on that connection
    if (!cfg.credId) {
      const r = await tx("/telephony_credentials", { method: "POST", body: JSON.stringify({ connection_id: cfg.connId, name: "war-room-webrtc" }) });
      const b = r.body as { data?: { id?: string } };
      if (!r.ok || !b.data?.id) return NextResponse.json({ error: `Telnyx refused the credential (${r.status}): ${r.text.slice(0, 180)}` }, { status: 502 });
      cfg.credId = b.data.id;
    }
    // persist provisioning
    const description = JSON.stringify(cfg);
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "telnyx-webrtc", category: CAT, url: "", description } });

    // 4) short-lived login token for the browser
    const tok = await tx(`/telephony_credentials/${cfg.credId}/token`, { method: "POST" });
    const token = typeof tok.body === "string" ? tok.body.trim() : tok.text.trim();
    if (!tok.ok || !token) return NextResponse.json({ error: `Telnyx token failed (${tok.status}): ${tok.text.slice(0, 160)}` }, { status: 502 });
    return NextResponse.json({ token, callerId: cfg.callerId ?? "", rep: me!.name });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 500 });
  }
}
