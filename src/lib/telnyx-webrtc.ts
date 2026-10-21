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

type AgentCred = { credId: string; sipUser: string; lastSeen?: string };
export type TelnyxCfg = { connId?: string; credId?: string; callerId?: string; ccAppId?: string; sipUser?: string; msgProfileId?: string; agents?: Record<string, AgentCred> };

// agentFirst: each rep gets their OWN telephony credential (own SIP identity),
// so inbound ring-all can ring every open browser instead of whichever one
// registered last on the shared credential.
export async function provisionAndToken(agentFirst?: string): Promise<{ token?: string; callerId?: string; error?: string; shared?: boolean; steps: string[] }> {
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
      cfg.callerId = process.env.TELNYX_CALLER_ID ?? "";
    } else steps.push("caller id set");
    // 📞 caller id MUST be a number that's live on Telnyx right now — never one that's
    // mid-port (those still ring in GHL and drop outbound). Re-checked every mint so a
    // ported number starts getting used the moment it goes active (Jon 2026-10-21).
    try {
      const { pickWorkingCallerId } = await import("./telnyx-numbers");
      const picked = await pickWorkingCallerId(cfg.callerId || process.env.TELNYX_CALLER_ID);
      if (picked.callerId) cfg.callerId = picked.callerId;
      steps.push(picked.active ? `caller id ${cfg.callerId} (live)` : `⚠️ caller id ${cfg.callerId || "none"} not confirmed live (${picked.live.length} live, ${picked.porting.length} porting)`);
    } catch { steps.push("caller id live-check skipped"); }
    if (!cfg.credId) {
      const r = await tx("/telephony_credentials", { method: "POST", body: JSON.stringify({ connection_id: cfg.connId, name: "war-room-webrtc" }) });
      const b = r.body as { data?: { id?: string } };
      if (!r.ok || !b.data?.id) return { error: `credential refused (${r.status}): ${r.text.slice(0, 200)}`, steps };
      cfg.credId = b.data.id;
      steps.push("telephony credential created");
    } else steps.push("telephony credential exists");
    // 📞 Per-agent credential (Jon 2026-10-21): each rep MUST get their OWN SIP
    // identity so they never register as the same user and kick each other off the
    // one shared Telnyx account — that was dropping every live call. Robust: create
    // on demand, and self-heal a stale/deleted credential (the usual culprit).
    let tokenCredId = cfg.credId!;
    let usedShared = true;
    const createAgentCred = async (): Promise<string> => {
      const r = await tx("/telephony_credentials", { method: "POST", body: JSON.stringify({ connection_id: cfg.connId, name: `wr-${agentFirst}-${Math.random().toString(36).slice(2, 6)}` }) });
      const b = r.body as { data?: { id?: string; sip_username?: string } };
      if (!r.ok || !b.data?.id) { steps.push(`agent credential refused ${r.status}: ${r.text.slice(0, 120)}`); return ""; }
      let sipUser = b.data.sip_username ?? "";
      if (!sipUser) { const g = await tx(`/telephony_credentials/${b.data.id}`); sipUser = (g.body as { data?: { sip_username?: string } }).data?.sip_username ?? ""; }
      cfg.agents![agentFirst!] = { credId: b.data.id, sipUser };
      steps.push(`agent credential created (${agentFirst})`);
      return b.data.id;
    };
    if (agentFirst) {
      cfg.agents = cfg.agents ?? {};
      let credId = cfg.agents[agentFirst]?.credId || "";
      if (!credId) credId = await createAgentCred();
      else steps.push(`agent credential exists (${agentFirst})`);
      if (credId) { tokenCredId = credId; usedShared = false; cfg.agents[agentFirst]!.lastSeen = new Date().toISOString(); }
    }
    const persist = async () => {
      const description = JSON.stringify(cfg);
      if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
      else await db.resource.create({ data: { title: "telnyx-webrtc", category: CAT, url: "", description } });
    };
    await persist();
    let tok = await tx(`/telephony_credentials/${tokenCredId}/token`, { method: "POST" });
    let token = typeof tok.body === "string" ? tok.body.trim() : tok.text.trim();
    // self-heal: a cached per-agent credential deleted on Telnyx → recreate it fresh
    if ((!tok.ok || !token) && agentFirst && !usedShared) {
      steps.push(`token mint failed on cached cred (${tok.status}) — recreating`);
      delete cfg.agents![agentFirst];
      const fresh = await createAgentCred();
      if (fresh) { tokenCredId = fresh; await persist(); }
      else { tokenCredId = cfg.credId!; usedShared = true; } // last resort: shared
      tok = await tx(`/telephony_credentials/${tokenCredId}/token`, { method: "POST" });
      token = typeof tok.body === "string" ? tok.body.trim() : tok.text.trim();
    }
    if (!tok.ok || !token) return { error: `token mint failed (${tok.status}): ${tok.text.slice(0, 180)}`, steps };
    steps.push(usedShared ? "⚠️ login token minted (SHARED line — reps will kick each other)" : "login token minted (own line)");
    return { token, callerId: cfg.callerId ?? "", shared: usedShared, steps };
  } catch (e) { return { error: String(e).slice(0, 200), steps }; }
}
