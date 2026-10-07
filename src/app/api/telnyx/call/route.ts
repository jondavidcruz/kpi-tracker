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
  let st: { bridgeTo?: string; oppId?: string; contactId?: string; rep?: string } = {};
  try { st = p.client_state ? JSON.parse(Buffer.from(p.client_state, "base64").toString()) : {}; } catch { /* none */ }
  const key = process.env.TELNYX_API_KEY;

  if (ev === "call.answered" && st.bridgeTo && key && p.call_control_id) {
    // rep picked up → dial the seller and bridge
    await fetch(`https://api.telnyx.com/v2/calls/${p.call_control_id}/actions/transfer`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: st.bridgeTo, from: process.env.TELNYX_CALLER_ID }),
    }).catch(() => {});
  }

  // ☎️ Missed INBOUND call → instant text-back + a task for the lead's owner
  // (GHL's signature move). Inbound legs carry no client_state.
  const pay = p as { direction?: string; from?: string; to?: string; hangup_cause?: string; start_time?: string; answered_at?: string };
  if (ev === "call.hangup" && !st.contactId && (pay.direction === "incoming" || !pay.direction) && pay.from && pay.to) {
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
          const res = await fetch("https://api.telnyx.com/v2/messages", {
            method: "POST",
            headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: pay.to, to: pay.from, text: `Hi ${first}, this is Freedom Offers — sorry we missed your call! We'll ring you right back. If it's about your property, reply here and we're on it.` }),
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
