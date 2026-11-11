import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logCrmEvent } from "@/lib/crm";
import { verifyBookToken, bookingUrl } from "@/lib/book-token";

export const dynamic = "force-dynamic";

// 📅 Seller self-booking (Jon 2026-11-11). Public, no-login — gated by the signed token in the link.
//  • GET  ?opp=ID&link=1  → (managers, logged in) returns the shareable booking URL for a lead.
//  • POST { token, slot } → books the appointment the seller picked: creates the CrmAppointment,
//    mirrors to the rep's Google Calendar, sends the seller their invite, logs it, tasks the rep.
export async function GET(req: NextRequest) {
  const oppId = req.nextUrl.searchParams.get("opp") || "";
  if (!oppId || req.nextUrl.searchParams.get("link") !== "1") return NextResponse.json({ ok: false }, { status: 400 });
  const { getCurrentUser, isManager } = await import("@/lib/auth");
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ ok: false, error: "managers only" }, { status: 403 });
  return NextResponse.json({ ok: true, url: bookingUrl(oppId) });
}

export async function POST(req: NextRequest) {
  let b: { token?: string; slot?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 }); }
  const oppId = verifyBookToken(b.token || "");
  if (!oppId) return NextResponse.json({ ok: false, error: "invalid or expired link" }, { status: 403 });

  const at = b.slot ? new Date(b.slot) : null;
  // sanity: a real future slot within the next ~45 days
  if (!at || Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 3_600_000 || at.getTime() > Date.now() + 45 * 86_400_000) {
    return NextResponse.json({ ok: false, error: "please pick a valid time" }, { status: 400 });
  }

  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { id: true, contactId: true, assignedTo: true, contact: { select: { name: true, address: true } } } });
  if (!opp) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  // Avoid duplicate bookings from a double-tap: same opp within 2 min.
  const recent = await db.crmAppointment.findFirst({ where: { oppId, createdAt: { gte: new Date(Date.now() - 120_000) } }, select: { id: true } }).catch(() => null);
  if (recent) return NextResponse.json({ ok: true, dup: true });

  const withWho = opp.assignedTo || "our team";
  const title = "📞 Phone · Offer call";
  const appt = await db.crmAppointment.create({ data: { oppId, contactId: opp.contactId, title, at, withWho, note: "[📞 Phone · Offer call] Self-booked by the seller", createdBy: "seller (self-book)" } });

  // mirror to the rep's Google Calendar + send the seller their invite (both best-effort)
  (async () => { const { pushApptToGcal } = await import("@/lib/gcal"); await pushApptToGcal({ id: appt.id, title, at, note: appt.note, withWho, leadName: opp.contact?.name, oppId }); })().catch(() => {});
  (async () => { const { sendSellerApptInvite } = await import("@/lib/appt-invite"); await sendSellerApptInvite({ id: appt.id, oppId, contactId: opp.contactId, title, at, note: appt.note, withWho }); })().catch(() => {});

  const whenPT = at.toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  await logCrmEvent({ contactId: opp.contactId, oppId, kind: "appt", body: `📅 Seller self-booked a call — ${whenPT} PT`, actor: "self-book" }).catch(() => {});
  // tell the rep right now
  if (opp.assignedTo) {
    const today = new Date().toISOString().slice(0, 10);
    await db.crmTask.create({ data: { oppId, contactId: opp.contactId, title: `📅 ${(opp.contact?.name || "A seller").split(" ")[0]} booked a call — ${whenPT} PT`, due: today, assignedTo: opp.assignedTo, createdBy: "self-book" } }).catch(() => {});
    try { const { sendPushTo } = await import("@/lib/push"); sendPushTo([opp.assignedTo.split(" ")[0]], { title: "📅 New booking", body: `${opp.contact?.name || "A seller"} booked a call — ${whenPT} PT`, url: `/crm/${oppId}`, tag: `book-${oppId}` }).catch(() => {}); } catch { /* ok */ }
  }
  return NextResponse.json({ ok: true, whenPT });
}
