// Telnyx WebRTC provisioning + token mint (shared by the token route and the
// ?telnyxprobe=1 diagnostic). Self-provisions once: credential connection →
// outbound voice profile → telephony credential, saved in __telnyx_webrtc__.
import { db } from "./db";

const CAT = "__telnyx_webrtc__";
const TX = "https://api.telnyx.com/v2";

async function tx(path: string, init?: RequestInit) {
  const res = await fetch(`${TX}${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const text = await res.text();
  let body: unknown; try { body = JSON.parse(text); } catch { body = text; }
  return { ok: res.ok, status: res.status, body, text };
}

type AgentCred = { credId: string; sipUser: string };
export type TelnyxCfg = { connId?: string; credId?: string; callerId?: string; ccAppId?: string; sipUser?: string; msgProfileId?: string; agents?: Record<string, AgentCred> };

// agentFirst: each rep gets their OWN telephony credential (own SIP identity),
// so inbound ring-all can ring every open browser instead of whichever one
// registered last on the shared credential.
export async function provisionAndToken(agentFirst?: string): Promise<{ token?: string; callerId?: string; error?: string; steps: string[] }> {
  const steps: string[] = [];
  if (!process.env.TELNYX_API_KEY) return { error: "TELNYX_API_KEY missing in Vercel", steps };
  const row = await db.resource.findFirst({ where: { category: CAT } });
  let cfg: TelnyxCfg = {};
  try { cfg = row?.description ? JSON.parse(row.description) : {}; } catch { /* fresh */ }
  try {
    if (!cfg.connId) {
      const user = `warroom${Math.random().toString(36).slice(2, 10)}`;
      const pass = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const r = await tx("/credential_connections", { method: "POST", body: JSON.stringify({ connection_name: "War Room Browser Dialer", user_name: user, password: pass, webrtc: true }) });
      const b = r.body as { data?: { id?: string } };
      if (!r.ok || !b.data?.id) return { error: `connection setup refused (${r.status}): ${r.text.slice(0, 200)}`, steps };
      cfg.connId = b.data.id;
      steps.push("credential connection created");
    } else steps.push("credential connection exists");
    if (!cfg.callerId) {
      const prof = await tx("/outbound_voice_profiles", { method: "POST", body: JSON.stringify({ name: "War Room Browser Dialer", traffic_type: "conversational" }) });
      const pb = prof.body as { data?: { id?: string } };
      if (pb.data?.id) { await tx(`/credential_connections/${cfg.connId}`, { method: "PATCH", body: JSON.stringify({ outbound: { outbound_voice_profile_id: pb.data.id } }) }); steps.push("outbound voice profile attached"); }
      else steps.push(`voice profile: ${prof.status} ${prof.text.slice(0, 120)}`);
      let caller = process.env.TELNYX_CALLER_ID ?? "";
      if (!caller) {
        const nums = await tx("/phone_numbers?page[size]=1");
        const nb = nums.body as { data?: Array<{ phone_number?: string }> };
        caller = nb.data?.[0]?.phone_number ?? "";
      }
      cfg.callerId = caller;
    } else steps.push("caller id set");
    if (!cfg.credId) {
      const r = await tx("/telephony_credentials", { method: "POST", body: JSON.stringify({ connection_id: cfg.connId, name: "war-room-webrtc" }) });
      const b = r.body as { data?: { id?: string } };
      if (!r.ok || !b.data?.id) return { error: `credential refused (${r.status}): ${r.text.slice(0, 200)}`, steps };
      cfg.credId = b.data.id;
      steps.push("telephony credential created");
    } else steps.push("telephony credential exists");
    // per-agent credential (ring-all): create once, remember its SIP username
    let tokenCredId = cfg.credId!;
    if (agentFirst) {
      cfg.agents = cfg.agents ?? {};
      if (!cfg.agents[agentFirst]?.credId) {
        const r = await tx("/telephony_credentials", { method: "POST", body: JSON.stringify({ connection_id: cfg.connId, name: `wr-${agentFirst}` }) });
        const b = r.body as { data?: { id?: string; sip_username?: string } };
        if (r.ok && b.data?.id) {
          let sipUser = b.data.sip_username ?? "";
          if (!sipUser) {
            const g = await tx(`/telephony_credentials/${b.data.id}`);
            const gb = g.body as { data?: { sip_username?: string } };
            sipUser = gb.data?.sip_username ?? "";
          }
          cfg.agents[agentFirst] = { credId: b.data.id, sipUser };
          steps.push(`agent credential created (${agentFirst}${sipUser ? "" : " — no sip_username!"})`);
        } else steps.push(`agent credential refused ${r.status} — falling back to shared`);
      } else steps.push(`agent credential exists (${agentFirst})`);
      if (cfg.agents[agentFirst]?.credId) tokenCredId = cfg.agents[agentFirst].credId;
    }
    const description = JSON.stringify(cfg);
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "telnyx-webrtc", category: CAT, url: "", description } });
    const tok = await tx(`/telephony_credentials/${tokenCredId}/token`, { method: "POST" });
    const token = typeof tok.body === "string" ? tok.body.trim() : tok.text.trim();
    if (!tok.ok || !token) return { error: `token mint failed (${tok.status}): ${tok.text.slice(0, 180)}`, steps };
    steps.push("login token minted");
    return { token, callerId: cfg.callerId ?? "", steps };
  } catch (e) { return { error: String(e).slice(0, 200), steps }; }
}
