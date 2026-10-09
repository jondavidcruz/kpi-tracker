import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logCrmEvent } from "@/lib/crm";

export const dynamic = "force-dynamic";

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
  type Sess = Record<string, { legs: string[]; answered: boolean; at: string; winner?: string }>;
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
      let cfg: { sipUser?: string; ccAppId?: string; agents?: Record<string, { sipUser: string; lastSeen?: string }> } = {};
      try { cfg = row?.description ? JSON.parse(row.description) : {}; } catch { /* none */ }
      // Only ring browsers seen in the last 5 min (presence heartbeat) — dead
      // credentials come back user_busy instantly and eat the ring window
      // (2026-10-09). No fresh agent at all → ring everything as a hail mary.
      const agentList = Object.values(cfg.agents ?? {});
      const fresh = agentList.filter((a) => a.lastSeen && Date.now() - Date.parse(a.lastSeen) < 5 * 60_000);
      const pool = fresh.length > 0 ? fresh : agentList;
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
      return NextResponse.json({ ok: true, bridged: true });
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
        delete map[st.ring];
        await writeSess(rowId, map);
        await txCall(st.ring, "hangup");
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
    const missed = !pay.answered_at; // never answered = missed, whatever the cause
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
