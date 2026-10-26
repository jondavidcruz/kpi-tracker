import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logCrmEvent } from "@/lib/crm";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // recording.saved does a Drive upload + Gemini transcript

// 🔎 Outcome breadcrumb into __telnyx_events__ so ?recdiag=1 shows WHY a recording
// did or didn't file (Jon 2026-10-15: recordings still not showing).
async function recCrumb(entry: Record<string, unknown>) {
  try {
    const row = await db.resource.findFirst({ where: { category: "__telnyx_events__" } });
    let list: unknown[] = [];
    try { list = row?.description ? JSON.parse(row.description) : []; } catch { /* fresh */ }
    list.unshift({ at: new Date().toISOString(), ...entry });
    const description = JSON.stringify(list.slice(0, 25));
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "telnyx-events", category: "__telnyx_events__", url: "", description } });
  } catch { /* logging never blocks */ }
}
// 🧭 Per-call from/to store (Jon 2026-10-15): recording.saved sometimes arrives with
// EMPTY from/to → the handler couldn't match a seller (noContact). We stash the
// numbers keyed by call_control_id while the call is live, and recover them here.
async function recCtxSet(ccId: string, from: string, to: string) {
  if (!ccId || (!from && !to)) return;
  try {
    const row = await db.resource.findFirst({ where: { category: "__rec_ctx__" } });
    let map: Record<string, { from: string; to: string }> = {};
    try { map = row?.description ? JSON.parse(row.description) : {}; } catch { /* fresh */ }
    map[ccId] = { from, to };
    const keys = Object.keys(map);
    if (keys.length > 80) for (const k of keys.slice(0, keys.length - 80)) delete map[k];
    const description = JSON.stringify(map);
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "rec-ctx", category: "__rec_ctx__", url: "", description } });
  } catch { /* best-effort */ }
}
async function recCtxGet(ccId: string): Promise<{ from: string; to: string } | null> {
  if (!ccId) return null;
  try { const row = await db.resource.findFirst({ where: { category: "__rec_ctx__" } }); const map = row?.description ? JSON.parse(row.description) : {}; return map[ccId] ?? null; } catch { return null; }
}
// Pull the mp3 URL out of whatever shape Telnyx sends (object, array, or string).
function pickMp3(x: unknown): string {
  if (!x) return "";
  if (typeof x === "string") return x;
  if (Array.isArray(x)) { const hit = x.find((u) => typeof u === "string" && /\.mp3|mp3/i.test(u)); return (hit as string) || (typeof x[0] === "string" ? x[0] : ""); }
  const o = x as { mp3?: string };
  return o.mp3 ?? "";
}

// Telnyx Call Control webhook for CRM click-to-call: we dial the REP first;
// when they answer, bridge the seller in; when it ends, log duration on the
// lead's timeline. Armed once TELNYX_CONNECTION_ID points its webhook here.
export async function POST(req: NextRequest) {
  let body: { data?: { event_type?: string; payload?: { call_control_id?: string; client_state?: string; hangup_cause?: string; start_time?: string; end_time?: string } } };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const ev = body.data?.event_type ?? "";
  const p = body.data?.payload ?? {};
  // breadcrumb log for ?inbounddiag=1 (last 25 events)
  try {
    const row = await db.resource.findFirst({ where: { category: "__telnyx_events__" } });
    let list: unknown[] = [];
    try { list = row?.description ? JSON.parse(row.description) : []; } catch { /* fresh */ }
    const pp = p as Record<string, unknown>;
    list.unshift({ at: new Date().toISOString(), ev, from: pp.from, to: pp.to, direction: pp.direction, cause: pp.hangup_cause, answered: pp.answered_at ? true : false });
    const description = JSON.stringify(list.slice(0, 25));
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "telnyx-events", category: "__telnyx_events__", url: "", description } });
  } catch { /* logging never blocks call handling */ }
  // Stash this call's from/to so recording.saved can recover them if its payload omits them.
  try { const pp2 = p as { from?: string; to?: string; call_control_id?: string }; if (pp2.call_control_id && (pp2.from || pp2.to)) await recCtxSet(pp2.call_control_id, pp2.from ?? "", pp2.to ?? ""); } catch { /* best-effort */ }
  let st: { bridgeTo?: string; oppId?: string; contactId?: string; rep?: string; ring?: string } = {};
  try { st = p.client_state ? JSON.parse(Buffer.from(p.client_state, "base64").toString()) : {}; } catch { /* none */ }
  const key = process.env.TELNYX_API_KEY;
  const txCall = (id: string, action: string, body?: object) =>
    fetch(`https://api.telnyx.com/v2/calls/${id}/actions/${action}`, {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }).catch(() => null);
  // ring sessions: inbound call id → outstanding browser legs (ring-all state)
  const SESS = "__ring_sessions__";
  type Sess = Record<string, { legs: string[]; answered: boolean; at: string; winner?: string; vm?: boolean; from?: string; callerName?: string }>;
  const readSess = async (): Promise<{ rowId: string | null; map: Sess }> => {
    const row = await db.resource.findFirst({ where: { category: SESS } });
    let map: Sess = {};
    try { map = row?.description ? JSON.parse(row.description) : {}; } catch { /* fresh */ }
    // prune anything older than 10 minutes (webhook loss shouldn't leak state)
    const cutoff = Date.now() - 10 * 60_000;
    for (const k of Object.keys(map)) if (Date.parse(map[k].at) < cutoff) delete map[k];
    return { rowId: row?.id ?? null, map };
  };
  const writeSess = async (rowId: string | null, map: Sess) => {
    const description = JSON.stringify(map);
    if (rowId) await db.resource.update({ where: { id: rowId }, data: { description } }).catch(() => {});
    else await db.resource.create({ data: { title: "ring-sessions", category: SESS, url: "", description } }).catch(() => {});
  };

  if (ev === "call.answered" && st.bridgeTo && key && p.call_control_id) {
    // rep picked up → dial the seller and bridge
    await fetch(`https://api.telnyx.com/v2/calls/${p.call_control_id}/actions/transfer`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: st.bridgeTo, from: process.env.TELNYX_CALLER_ID }),
    }).catch(() => {});
  }

  // ☎️ Inbound v3 — RING-ALL: dial every agent's own SIP identity at once
  // (plus the legacy shared one); first browser to answer gets bridged, the
  // rest are hung up. Nobody answers → every leg dies → caller hangup path
  // sends the text-back.
  if (ev === "call.initiated" && !st.bridgeTo && !st.ring && key && p.call_control_id) {
    const pay0 = p as { direction?: string; to?: string; from?: string };
    // ⚠️ Only a REAL seller call (dialed to one of our +1 numbers). Since the
    // SIP unlock, every browser leg we dial fires its own mirror "incoming"
    // event with to=gencredXXX — treating those as new calls made ring waves
    // spawn ring waves (Jon 2026-10-09: answered → instantly hung up).
    if (pay0.direction === "incoming" && (pay0.to ?? "").startsWith("+")) {
      const row = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } });
      let cfg: { sipUser?: string; ccAppId?: string; agents?: Record<string, { sipUser: string; lastSeen?: string; onCall?: boolean; busyAt?: string }> } = {};
      try { cfg = row?.description ? JSON.parse(row.description) : {}; } catch { /* none */ }
      // Only ring browsers seen in the last 5 min (presence heartbeat) — dead
      // credentials come back user_busy instantly and eat the ring window
      // (2026-10-09). No fresh agent at all → ring everything as a hail mary.
      const agentList = Object.values(cfg.agents ?? {});
      const fresh = agentList.filter((a) => a.lastSeen && Date.now() - Date.parse(a.lastSeen) < 5 * 60_000);
      // 📞 skip agents already ON a call (Jon 2026-10-13: "route only to the
      // agent who is available"). busyAt within ~3min = on a call now. If that
      // leaves nobody, fall back to all fresh so we never black-hole a call.
      const available = fresh.filter((a) => !(a.onCall && a.busyAt && Date.now() - Date.parse(a.busyAt) < 3 * 60_000));
      // 📞 Cap simultaneous ring legs (Jon 2026-10-26): each leg = 1 Telnyx channel, and
      // ringing the WHOLE team at once blew past the 10-concurrent cap → the answer-bridge
      // got rejected and calls dropped on pickup. Ring the most-recently-active available
      // agents (most likely to be at their desk), capped so one call can't exhaust channels.
      const RING_CAP = Number(process.env.RING_CAP || 6);
      type Ag = { sipUser: string; lastSeen?: string; onCall?: boolean; busyAt?: string };
      const byRecent = (list: Ag[]) => [...list].sort((a, b) => Date.parse(b.lastSeen || "0") - Date.parse(a.lastSeen || "0")).slice(0, RING_CAP);
      const pool = available.length > 0 ? byRecent(available) : fresh.length > 0 ? byRecent(fresh) : agentList.slice(0, RING_CAP);
      const targets = [...new Set([
        ...pool.map((a) => a.sipUser),
        ...(fresh.length > 0 ? [] : [cfg.sipUser ?? ""]),
      ].filter(Boolean))];
      const inId = p.call_control_id;
      // ⚡ idempotency FIRST: slow handling made Telnyx RETRY call.initiated,
      // each retry dialed another wave of ring legs, and answering a leg the
      // next wave's cleanup had already cancelled = "call ended" instantly
      // (Jon 2026-10-09). One wave per inbound call, ever.
      {
        const { rowId, map } = await readSess();
        if (map[inId]) return NextResponse.json({ ok: true, dup: true });
        map[inId] = { legs: [], answered: false, at: new Date().toISOString() };
        await writeSess(rowId, map);
      }
      const clientState = Buffer.from(JSON.stringify({ ring: inId })).toString("base64");
      // dial every browser in PARALLEL — sequential dials were what pushed the
      // handler past Telnyx's webhook timeout in the first place
      const legs = (await Promise.all(targets.map(async (sip) => {
        const r = await fetch("https://api.telnyx.com/v2/calls", {
          method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            connection_id: cfg.ccAppId, to: `sip:${sip}@sip.telnyx.com`,
            from: pay0.from ?? pay0.to, timeout_secs: 30, client_state: clientState,
          }),
        }).catch(() => null);
        const rb = r ? ((await r.json().catch(() => ({}))) as { data?: { call_control_id?: string } }) : {};
        return rb.data?.call_control_id ?? "";
      }))).filter(Boolean);
      {
        const { rowId, map } = await readSess();
        if (map[inId]) { map[inId].legs = legs; await writeSess(rowId, map); }
      }
      // 📲 push alert so phones buzz even when nobody's at a computer
      try {
        const caller10 = (pay0.from ?? "").replace(/\D/g, "").slice(-10);
        const c = caller10.length === 10 ? await db.crmContact.findFirst({ where: { phone: { contains: caller10 } }, select: { name: true } }) : null;
        // stamp the caller onto the ring session → every tab's poll can show it
        try {
          const { rowId: rrId, map: rmap } = await readSess();
          if (rmap[inId]) { rmap[inId].from = pay0.from ?? ""; rmap[inId].callerName = c?.name ?? ""; await writeSess(rrId, rmap); }
        } catch { /* cosmetic */ }
        const { sendPushTo } = await import("@/lib/push");
        sendPushTo("all", { title: `📞 Incoming call — ${c?.name ?? pay0.from ?? "unknown"}`, body: "Ringing the War Room now — open it on a computer to answer.", url: "/crm", tag: "ring" }).catch(() => {});
      } catch { /* best-effort */ }
      if (legs.length === 0 && cfg.sipUser) {
        // dial-out refused entirely → old single transfer as a last resort
        await txCall(inId, "transfer", { to: `sip:${cfg.sipUser}@sip.telnyx.com`, timeout_secs: 25 });
      }
      return NextResponse.json({ ok: true });
    }
  }

  // Ring leg ANSWERED → remember the winner, tell Telnyx to answer the
  // seller's leg, hang up the losers. DO NOT bridge yet: "answer" is async,
  // and bridging before the seller's leg is live fails silently — browser
  // connected to nothing while the caller keeps hearing ringback (Jon
  // 2026-10-09). The bridge happens below, when the seller's call.answered
  // webhook confirms the leg is actually up.
  if (ev === "call.answered" && st.ring && key && p.call_control_id) {
    const { rowId, map } = await readSess();
    const sess = map[st.ring];
    if (sess && !sess.answered) {
      sess.answered = true;
      sess.winner = p.call_control_id;
      await writeSess(rowId, map);
      await txCall(st.ring, "answer");
      for (const leg of sess.legs) if (leg !== p.call_control_id) await txCall(leg, "hangup");
      // 🏷 WHO answered (Jon 2026-10-12): the winning leg's SIP user maps to an
      // agent; stash it so every other screen can show "answered by X" and the
      // lead's timeline records it.
      try {
        const pw = p as { to?: string; from?: string };
        const sipUser = (pw.to ?? "").replace(/^sip:/, "").split("@")[0];
        const cfgRow = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } });
        const cfgA = (cfgRow?.description ? JSON.parse(cfgRow.description) : {}) as { agents?: Record<string, { sipUser?: string }> };
        const agent = Object.entries(cfgA.agents ?? {}).find(([, a]) => a.sipUser === sipUser)?.[0] ?? "";
        const caller = pw.from ?? "";
        const last10 = caller.replace(/\D/g, "").slice(-10);
        const contact = last10.length === 10 ? await db.crmContact.findFirst({ where: { phone: { contains: last10 } }, select: { id: true, name: true } }) : null;
        const laRow = await db.resource.findFirst({ where: { category: "__last_answer__" } });
        const payload = JSON.stringify({ at: new Date().toISOString(), agent, from: caller, callerName: contact?.name ?? "" });
        if (laRow) await db.resource.update({ where: { id: laRow.id }, data: { description: payload } });
        else await db.resource.create({ data: { title: "last-answer", category: "__last_answer__", url: "", description: payload } });
        if (contact && agent) await logCrmEvent({ contactId: contact.id, oppId: "", kind: "call", body: `📞 ${agent[0].toUpperCase()}${agent.slice(1)} answered a call from ${contact.name} (${caller})`, actor: agent }).catch(() => {});
      } catch { /* cosmetic — never blocks the bridge */ }
    } else {
      // raced: someone else already took it
      await txCall(p.call_control_id, "hangup");
    }
    return NextResponse.json({ ok: true });
  }

  // Seller's leg is now LIVE (its own call.answered, no client_state) →
  // bridge it to the winning browser leg.
  if (ev === "call.answered" && !st.ring && !st.bridgeTo && key && p.call_control_id) {
    const { map } = await readSess();
    const sess = map[p.call_control_id];
    if (sess?.winner) {
      await txCall(p.call_control_id, "bridge", { call_control_id: sess.winner });
      // 🎙 record the whole conversation (dual channel = both voices) — the
      // recording.saved handler files it on the lead + transcribes it
      await txCall(p.call_control_id, "record_start", { format: "mp3", channels: "dual" });
      return NextResponse.json({ ok: true, bridged: true });
    }
    if (sess?.vm) {
      const vmState = Buffer.from(JSON.stringify({ vm: p.call_control_id })).toString("base64");
      await txCall(p.call_control_id, "speak", {
        payload: "Hi! Sorry we missed your call. We're sending you a text message right now — reply there and we're on it. Talk soon!",
        voice: "female", language: "en-US", client_state: vmState,
      });
      return NextResponse.json({ ok: true, vm: true });
    }
    // 📼 outbound browser call answered → remember the leg so 📼 Drop VM can
    // speak into it (Jon 2026-10-12). RECORDING (2026-10-13): started both
    // client-side from the dialer (primary, /api/telnyx/record) AND here as a
    // server-side FALLBACK — whichever fires first wins; a 2nd record_start on
    // the same call is a no-op, and recording.saved dedupes the event. Belt +
    // suspenders because recordings are the #1 priority.
    const pd = p as { direction?: string; to?: string };
    if (pd.direction === "outgoing" && (pd.to ?? "").startsWith("+")) {
      await txCall(p.call_control_id, "record_start", { format: "mp3", channels: "dual" }).catch(() => {});
      try {
        const last10 = (pd.to ?? "").replace(/\D/g, "").slice(-10);
        const row5 = await db.resource.findFirst({ where: { category: "__active_out__" } });
        let m5: Record<string, { id: string; at: string }> = {};
        try { m5 = row5?.description ? JSON.parse(row5.description) : {}; } catch { /* fresh */ }
        const cutoff = Date.now() - 2 * 3600_000;
        for (const k of Object.keys(m5)) if (Date.parse(m5[k].at) < cutoff) delete m5[k];
        m5[last10] = { id: p.call_control_id, at: new Date().toISOString() };
        const d5 = JSON.stringify(m5);
        if (row5) await db.resource.update({ where: { id: row5.id }, data: { description: d5 } });
        else await db.resource.create({ data: { title: "active-out", category: "__active_out__", url: "", description: d5 } });
      } catch { /* vm drop is best-effort */ }
      return NextResponse.json({ ok: true, recording: true });
    }
  }

  // 🎙 Recording landed → file it on the lead: MP3 → the deal's Drive folder,
  // link + transcript on the timeline (Jon's backlog item #1, 2026-10-12).
  if (ev === "call.recording.saved") {
    const pr = p as unknown as { recording_urls?: unknown; public_recording_urls?: unknown; download_urls?: unknown; from?: string; to?: string; direction?: string; call_control_id?: string; recording_started_at?: string; recording_ended_at?: string };
    const url = pickMp3(pr.download_urls) || pickMp3(pr.recording_urls) || pickMp3(pr.public_recording_urls) || "";
    if (!url) { await recCrumb({ ev: "rec.outcome", result: "noUrl", cc: (pr.call_control_id ?? "").slice(0, 8) }); return NextResponse.json({ ok: true, noUrl: true }); }
    // 🔁 dedupe: a double record_start (client + webhook fallback) could produce
    // two recording.saved events for the same call — skip if we already filed one
    // for this call_control_id (Jon 2026-10-13).
    const ccId = pr.call_control_id ?? "";
    if (ccId) {
      const dupRec = await db.crmEvent.findFirst({ where: { kind: "call", body: { startsWith: "🎙" }, meta: { path: ["ccId"], equals: ccId } }, select: { id: true } }).catch(() => null);
      if (dupRec) return NextResponse.json({ ok: true, deduped: true });
    }
    // Recover from/to if Telnyx omitted them on recording.saved (the noContact bug).
    let fromN = pr.from ?? "", toN = pr.to ?? "";
    if (!fromN && !toN && ccId) { const ctx = await recCtxGet(ccId); if (ctx) { fromN = ctx.from; toN = ctx.to; } }
    // whoever on the call is in our CRM = the lead
    let contact: { id: string } | null = null;
    for (const num of [fromN, toN]) {
      const last10 = num.replace(/\D/g, "").slice(-10);
      if (last10.length !== 10) continue;
      contact = await db.crmContact.findFirst({ where: { phone: { contains: last10 } }, select: { id: true } });
      if (contact) break;
    }
    // 🆕 Jon 2026-10-13: if neither number is a contact yet (e.g. a brand-new
    // inbound caller, or a test call), create one from the seller-side number so
    // the recording never vanishes. Inbound → caller is `from`; outbound → `to`.
    if (!contact) {
      const sellerNum = pr.direction === "incoming" ? fromN : pr.direction === "outgoing" ? toN : (fromN || toN);
      const last10 = sellerNum.replace(/\D/g, "").slice(-10);
      if (last10.length === 10) {
        const e164 = sellerNum.startsWith("+") ? sellerNum : `+1${last10}`;
        contact = await db.crmContact.create({ data: { name: last10.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3"), phone: e164, source: "Phone call" } });
      }
    }
    if (!contact) { await recCrumb({ ev: "rec.outcome", result: "noContact", from: (pr.from ?? "").slice(-10), to: (pr.to ?? "").slice(-10) }); return NextResponse.json({ ok: true, noContact: true }); }
    const opp = await db.crmOpportunity.findFirst({ where: { contactId: contact.id, archivedAt: null }, select: { id: true, title: true, pipeline: true, formData: true, contact: { select: { address: true, name: true, phone: true } } } });
    // 👤 Who handled this call — carry it onto the recording so the bubble shows the
    // rep, not "recorder" (Jon 2026-10-22). Use the most recent human-actor call event
    // for this contact (inbound answer, click-to-call, or dialer disposition).
    const SYS_ACTORS = ["recorder", "inbound", "inbound-sms", "telnyx", "telnyx-dlr", "coach", "auto", "system"];
    const priorCall = await db.crmEvent.findFirst({ where: { contactId: contact.id, kind: "call", actor: { notIn: SYS_ACTORS }, at: { gte: new Date(Date.now() - 30 * 60000) } }, orderBy: { at: "desc" }, select: { actor: true } }).catch(() => null);
    const rep = (priorCall?.actor || "").trim();
    const secs = pr.recording_started_at && pr.recording_ended_at ? Math.max(0, Math.round((Date.parse(pr.recording_ended_at) - Date.parse(pr.recording_started_at)) / 1000)) : 0;
    // 🎙 Only REAL conversations are filed to the deal's Drive (Jon 2026-10-26: "majority
    // are just voicemails"). Keep when the call ran ≥ 60s AND the rep hasn't dispositioned
    // it as a voicemail/no-answer. Short/VM calls still log a lightweight note — no Drive
    // clutter, no wasted Gemini transcription. (A later voicemail disposition also pulls a
    // kept recording back out — see dialerOutcome*Action.)
    const { readRecentCallDispo, NO_KEEP_OUTCOMES } = await import("@/lib/call-dispo");
    const recentDispo = await readRecentCallDispo(contact.id).catch(() => null);
    const dispoVoicemail = !!recentDispo && NO_KEEP_OUTCOMES.includes(recentDispo.outcome);
    if (secs < 60 || dispoVoicemail) {
      const why = dispoVoicemail ? "voicemail / no answer" : "short — likely voicemail";
      await logCrmEvent({ contactId: contact.id, oppId: opp?.id ?? "", kind: "call", body: `📞 Call${secs ? ` · ${Math.floor(secs / 60)}m ${secs % 60}s` : ""} — ${why}, recording not filed`, meta: { secs, ccId, skipped: "voicemail" }, actor: rep || "recorder" }).catch(() => {});
      await recCrumb({ ev: "rec.outcome", result: "skip-voicemail", secs });
      return NextResponse.json({ ok: true, skipped: "voicemail", secs });
    }
    try {
      const res = await fetch(url);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!res.ok || bytes.length === 0) throw new Error(`download ${res.status}`);
      let link = "", driveId = "";
      if (bytes.length <= 15 * 1024 * 1024) {
        const { gdriveConfigured, ensureSubfolder, uploadToFolder, listFolder, dealsParent } = await import("@/lib/gdrive");
        if (gdriveConfigured()) {
          const DEALS_PARENT = await dealsParent();
          const label = (opp?.contact.address || opp?.title || opp?.contact.name || "Unfiled").trim();
          const streetNo = label.match(/^\d+/)?.[0];
          let folderId = "";
          if (streetNo) {
            const existing = (await listFolder(DEALS_PARENT).catch(() => [])).find((fo) => fo.name.startsWith(streetNo));
            if (existing) folderId = existing.id;
          }
          if (!folderId) folderId = await ensureSubfolder(DEALS_PARENT, label.slice(0, 80));
          const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
          const up = await uploadToFolder(folderId, `call ${stamp}.mp3`, bytes, "audio/mpeg", true); // public + streamable for the player
          link = up.link; driveId = up.id;
        }
      }
      // 📝 Transcribe + SUMMARIZE in one Gemini call (Jon 2026-10-13: "AI get the
      // MAIN details, not the whole transcript in the notes"). The note shows a
      // short key-points summary; the full transcript rides along in meta.
      let transcript = "";
      if (process.env.GEMINI_API_KEY && bytes.length < 9 * 1024 * 1024) {
        try {
          const b64 = Buffer.from(bytes).toString("base64");
          const tr = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: "audio/mp3", data: b64 } }, { text: "This is a recorded real-estate acquisitions phone call. Reply in EXACTLY this format:\nSUMMARY:\n- (3 to 6 short bullets covering: seller's motivation to sell, asking price / any numbers discussed, timeline, property condition or issues, objections, and the agreed next step)\n\nTRANSCRIPT:\n(full transcript, labeling speakers 'Rep:' and 'Seller:')" }] }], generationConfig: { maxOutputTokens: 4000 } }),
            signal: AbortSignal.timeout(40000),
          });
          const tj = (await tr.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
          const out = tj.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("").trim() ?? "";
          const m = out.split(/\n\s*TRANSCRIPT:\s*\n/i);
          const summary = (m[0] || "").replace(/^\s*SUMMARY:\s*\n?/i, "").trim();
          transcript = (m[1] || (m.length === 1 ? out : "")).trim();
          if (summary) await logCrmEvent({ contactId: contact.id, oppId: opp?.id ?? "", kind: "note", body: `📞 Call summary (AI) — ${secs ? `${Math.floor(secs / 60)}m ${secs % 60}s` : ""}\n${summary}`.slice(0, 2000), actor: "recorder" });
        } catch { /* recording itself is already filed below */ }
      }
      // 🧹 One clean timeline row (Jon 2026-10-26): no raw Drive URL in the body (the audio
      // player + transcript already link it), and if the rep already logged a disposition for
      // this call, fold the recording INTO that entry instead of adding a second "Call" row.
      const recBody = `🎙 Call recording${secs ? ` · ${Math.floor(secs / 60)}m ${secs % 60}s` : ""}${link ? "" : " (Drive upload unavailable — Telnyx copy expires)"}`;
      const recMeta = { link, driveId: driveId || undefined, secs, ccId, transcript: transcript.slice(0, 12000), rep: rep || undefined };
      const { foldRecordingIntoDispo } = await import("@/lib/call-merge");
      if (!(await foldRecordingIntoDispo(contact.id, recBody, recMeta).catch(() => false)))
        await logCrmEvent({ contactId: contact.id, oppId: opp?.id ?? "", kind: "call", body: recBody, meta: recMeta, actor: rep || "recorder" });
      await recCrumb({ ev: "rec.outcome", result: "filed", hasLink: !!link, secs });

      // whether this lead is a buyer (dispo network) vs a seller — drives the
      // coaching rubric label + skips property pre-fill for buyer calls.
      const { isDevNetworkName, isAgentNetworkName } = await import("@/lib/dispo-buyers");
      const isBuyer = !!opp && (isDevNetworkName(opp.pipeline) || isAgentNetworkName(opp.pipeline));

      // 📋 Pre-fill home/land intake from the call — ONLY empty fields, never overwrite
      // (Jon 2026-10-22). Seller leads only. One extra Gemini (free-tier) extract.
      if (transcript && opp && !isBuyer && process.env.GEMINI_API_KEY) {
        try {
          const { aiText } = await import("@/lib/ai");
          const raw = await aiText({ skipAnthropic: true, maxTokens: 600, system: `Extract facts a real-estate acquisitions rep would log from this seller call. Use ONLY what was actually said; omit anything not stated. Respond with ONLY valid JSON (no markdown) using these keys when present: {"motivation": "...", "timeline": "...", "wants": "asking/desired $ or amount", "occupancy": "Vacant|Owner-occupied|Tenant|Unknown", "condition": "home condition in a few words", "repairs": "repairs mentioned", "acreage": "acres if land", "zoning": "zoning if mentioned"}. Keep each value short.`, messages: [{ role: "user", content: transcript.slice(0, 16000) }] });
          const mjson = raw.match(/\{[\s\S]*\}/);
          const ex = mjson ? (JSON.parse(mjson[0]) as Record<string, unknown>) : {};
          const fd = (opp.formData ?? {}) as Record<string, Record<string, unknown>>;
          const { sellerKind } = await import("@/lib/lead-type");
          const kind = sellerKind(opp.formData, opp.pipeline);
          const hasLand = fd.land && Object.keys(fd.land).length > 0;
          const hasProp = fd.property && Object.keys(fd.property).length > 0;
          const target = hasLand ? "land" : hasProp ? "property" : (kind === "seller_land" ? "land" : "property");
          const CORE = ["motivation", "timeline", "wants", "occupancy"];
          const allowed = target === "land" ? [...CORE, "acreage", "zoning"] : [...CORE, "condition", "repairs"];
          const existing = (fd[target] ?? {}) as Record<string, unknown>;
          const add: Record<string, string> = {};
          for (const k of allowed) { const v = ex[k]; if (v && String(v).trim() && !String(existing[k] ?? "").trim()) add[k] = String(v).trim().slice(0, 300); }
          if (Object.keys(add).length) {
            await db.crmOpportunity.update({ where: { id: opp.id }, data: { formData: { ...fd, [target]: { ...existing, ...add } } as never } });
            await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "note", body: `📋 Pre-filled ${target === "land" ? "Land" : "Home"} details from the call (empty fields only): ${Object.keys(add).join(", ")}. Review + edit as needed.`, actor: "recorder" });
          }
        } catch { /* pre-fill is a bonus — the recording + summary already landed */ }
      }

      // 🎯 auto-score every real conversation (≥60s) against the coaching rubric.
      // Runs on Gemini's free tier (near-zero cost) and writes a CallScore row so it
      // shows up in Call Scoring / coaching for the whole team (Jon 2026-10-22).
      if (transcript && secs >= 60) {
        try {
          const { scoreTranscript } = await import("@/lib/score");
          const label = isBuyer ? "buyer/disposition call" : "seller call";
          const sc = await scoreTranscript(transcript, { label, gemini: true });
          if (sc.configured && sc.overall > 0) {
            const lines = sc.breakdown.slice(0, 5).map((b) => `• ${b.area}: ${b.score} — ${b.note}`).join("\n");
            await logCrmEvent({ contactId: contact.id, oppId: opp?.id ?? "", kind: "note", body: `🎯 AI call score: ${sc.overall}/100\n${lines}\n💡 ${sc.summary}`.slice(0, 3800), actor: "coach" });
            // write the coaching record (dedupe by this recording's audio link)
            const dup = link ? await db.callScore.findFirst({ where: { audioUrl: link }, select: { id: true } }).catch(() => null) : null;
            if (!dup) {
              await db.callScore.create({ data: {
                repName: rep || "Unknown", callType: isBuyer ? "buyer" : "seller",
                direction: pr.direction === "incoming" ? "inbound" : pr.direction === "outgoing" ? "outbound" : "",
                address: opp?.contact.address || opp?.title || "", sellerName: opp?.contact.name || "", sellerPhone: opp?.contact.phone || "",
                scoredBy: "auto", overall: sc.overall, breakdown: JSON.stringify(sc.breakdown), summary: sc.summary,
                transcript: transcript.slice(0, 20000), audioUrl: link || "",
              } }).catch(() => {});
            }
          }
        } catch { /* scoring is gravy — transcript already landed */ }
      }
    } catch (e) {
      await recCrumb({ ev: "rec.outcome", result: "failed", err: String(e).slice(0, 80) });
      await logCrmEvent({ contactId: contact.id, oppId: opp?.id ?? "", kind: "system", body: `🎙 Recording save failed: ${String(e).slice(0, 120)}`, actor: "recorder" }).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  // Voicemail-style message finished → hang up and clean the session
  if (ev === "call.speak.ended" || ev === "call.playback.ended") {
    const stVm = st as { vm?: string };
    if (stVm.vm) {
      await txCall(stVm.vm, "hangup");
      const { rowId, map } = await readSess();
      if (map[stVm.vm]) { delete map[stVm.vm]; await writeSess(rowId, map); }
      return NextResponse.json({ ok: true });
    }
  }

  // Ring leg died (timeout/decline/offline) → when the LAST leg dies with no
  // answer, try the PSTN FALLBACK phone (browsers asleep ≠ missed deal — Jon
  // 2026-10-08); only when that also dies does the text-back path fire.
  if (ev === "call.hangup" && st.ring) {
    const { rowId, map } = await readSess();
    const sess = map[st.ring] as (typeof map)[string] & { fallback?: boolean };
    if (sess) {
      sess.legs = sess.legs.filter((l) => l !== p.call_control_id);
      if (!sess.answered && sess.legs.length === 0) {
        // Fallback = ONLY the env override (Jon 2026-10-09: "I don't want it
        // to ring someone's personal number — only ring our CRM"). No roster
        // scan. Unset env (today's state) = no PSTN leg; the missed-call
        // text-back + CALL BACK NOW task are the net.
        const fb = process.env.TELNYX_FALLBACK_NUMBER ?? "";
        // breadcrumb so ?inbounddiag=1 shows WHY a caller did or didn't ring a cell
        try {
          const row3 = await db.resource.findFirst({ where: { category: "__telnyx_events__" } });
          let list3: unknown[] = [];
          try { list3 = row3?.description ? JSON.parse(row3.description) : []; } catch { /* fresh */ }
          list3.unshift({ at: new Date().toISOString(), ev: "fallback-resolve", to: fb || "(no env fallback — CRM browsers only, by design)" });
          if (row3) await db.resource.update({ where: { id: row3.id }, data: { description: JSON.stringify(list3.slice(0, 25)) } });
        } catch { /* never blocks */ }
        if (fb && !sess.fallback && key) {
          const row2 = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } });
          let cfg2: { ccAppId?: string } = {};
          try { cfg2 = row2?.description ? JSON.parse(row2.description) : {}; } catch { /* none */ }
          const clientState2 = Buffer.from(JSON.stringify({ ring: st.ring })).toString("base64");
          const r2 = await fetch("https://api.telnyx.com/v2/calls", {
            method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ connection_id: cfg2.ccAppId, to: fb, from: process.env.TELNYX_CALLER_ID ?? fb, timeout_secs: 20, client_state: clientState2 }),
          }).catch(() => null);
          const rb2txt = r2 ? await r2.text().catch(() => "") : "(network error)";
          let rb2: { data?: { call_control_id?: string } } = {};
          try { rb2 = JSON.parse(rb2txt); } catch { /* non-JSON error body */ }
          if (rb2.data?.call_control_id) {
            sess.fallback = true;
            sess.legs = [rb2.data.call_control_id];
            await writeSess(rowId, map);
            return NextResponse.json({ ok: true, fallback: true });
          }
          // dial refused (intl blocked, bad number, balance…) → leave the
          // reason in the breadcrumbs instead of failing silently
          try {
            const row4 = await db.resource.findFirst({ where: { category: "__telnyx_events__" } });
            let list4: unknown[] = [];
            try { list4 = row4?.description ? JSON.parse(row4.description) : []; } catch { /* fresh */ }
            list4.unshift({ at: new Date().toISOString(), ev: "fallback-dial-FAILED", to: fb, cause: `${r2?.status ?? "no-response"}: ${rb2txt.slice(0, 160)}` });
            if (row4) await db.resource.update({ where: { id: row4.id }, data: { description: JSON.stringify(list4.slice(0, 25)) } });
          } catch { /* never blocks */ }
        }
        // nobody answered → answer and SAY so (endless ringing then a dead
        // drop feels broken to sellers — Jon 2026-10-11), then the speak.ended
        // handler hangs up; the missed-call text still fires (vm flag below).
        sess.vm = true;
        await writeSess(rowId, map);
        await txCall(st.ring, "answer");
      } else await writeSess(rowId, map);
    }
    return NextResponse.json({ ok: true });
  }

  // ☎️ Missed INBOUND call → instant text-back + a task for the lead's owner
  // (GHL's signature move). Inbound legs carry no client_state.
  const pay = p as { direction?: string; from?: string; to?: string; hangup_cause?: string; start_time?: string; answered_at?: string };
  if (ev === "call.hangup" && !st.contactId && (pay.direction === "incoming" || !pay.direction) && pay.from && pay.to && pay.to.startsWith("+")) {
    // caller hung up while browsers were still ringing → stop the ring legs
    if (p.call_control_id) {
      const { rowId, map } = await readSess();
      const sess = map[p.call_control_id];
      if (sess) {
        for (const leg of sess.legs) await txCall(leg, "hangup");
        delete map[p.call_control_id];
        await writeSess(rowId, map);
      }
    }
    // never answered = missed — and the voicemail-speak path ANSWERS the call
    // to play its message, so the vm flag keeps counting it as missed
    const missed = !pay.answered_at || !!(st as { vm?: unknown }).vm;
    if (missed && pay.from.replace(/\D/g, "").length >= 10) {
      const last10 = pay.from.replace(/\D/g, "").slice(-10);
      const contact = await db.crmContact.findFirst({ where: { phone: { contains: last10 } }, select: { id: true, name: true, assignedTo: true } });
      const hourKey = `mcb-${last10}-${new Date().toISOString().slice(0, 13)}`;
      const dup = contact ? await db.crmEvent.findFirst({ where: { contactId: contact.id, meta: { path: ["msgId"], equals: hourKey } }, select: { id: true } }).catch(() => null) : null;
      if (!dup) {
        let texted = false;
        if (process.env.TELNYX_API_KEY) {
          const first = contact?.name.split(" ")[0] ?? "there";
          // editable in CRM → Automations → Message automations (Jon 2026-10-08)
          const { readMsgTemplates, fillTokens } = await import("@/lib/msg-templates");
          const tpl = (await readMsgTemplates()).missed_call_sms;
          const res = await fetch("https://api.telnyx.com/v2/messages", {
            method: "POST",
            headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: pay.to, to: pay.from, text: fillTokens(tpl, { first, rep: contact?.assignedTo?.split(" ")[0] }) }),
          }).catch(() => null);
          texted = !!res?.ok;
        }
        if (contact) {
          await logCrmEvent({ contactId: contact.id, kind: "call", body: `📵 Missed inbound call from ${pay.from}${texted ? " — auto text-back sent ✅" : " (text-back failed — number may need a messaging profile)"}`, meta: { msgId: hourKey }, actor: "inbound" });
          await db.crmTask.create({ data: { contactId: contact.id, title: `📞 CALL BACK NOW — they called us (${pay.from})`, due: new Date().toISOString().slice(0, 10), assignedTo: contact.assignedTo, createdBy: "inbound" } }).catch(() => {});
          try {
            const { sendPushTo } = await import("@/lib/push");
            sendPushTo(contact.assignedTo ? [contact.assignedTo.split(" ")[0]] : "all", { title: `📵 Missed call — ${contact.name}`, body: `${pay.from} · auto text-back ${texted ? "sent" : "failed"} — call them back`, url: `/crm/conversations?c=${contact.id}`, tag: `missed-${contact.id}` }).catch(() => {});
          } catch { /* best-effort */ }
        }
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (ev === "call.hangup" && st.contactId) {
    const secs = p.start_time && p.end_time ? Math.max(0, Math.round((Date.parse(p.end_time) - Date.parse(p.start_time)) / 1000)) : null;
    await logCrmEvent({
      contactId: st.contactId, oppId: st.oppId ?? "", kind: "call",
      body: `Telnyx call ended${secs != null ? ` · ${Math.floor(secs / 60)}m ${secs % 60}s` : ""}${p.hangup_cause ? ` (${p.hangup_cause})` : ""}`,
      meta: { secs, cause: p.hangup_cause }, actor: st.rep ?? "telnyx",
    });
    // nudge the opp's updatedAt so it bubbles on the board
    if (st.oppId) await db.crmOpportunity.update({ where: { id: st.oppId }, data: { updatedAt: new Date() } }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
