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
