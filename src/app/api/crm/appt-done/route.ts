import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { markApptDone } from "@/lib/appt-done";

export const dynamic = "force-dynamic";

// ✓ Mark one appointment done from the due-reminder popup (Jon 2026-11-05: "a mark-done
// for appts like tasks"). Stored in a reserved Resource JSON set (no schema column — see
// lib/appt-done). Allowed when the appointment is assigned to me (withWho) or I'm a manager.
// Logs to the activity feed so the completion shows on the lead timeline.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "no auth" }, { status: 401 });
  const { id } = await req.json().catch(() => ({ id: "" }));
  if (!id) return NextResponse.json({ error: "no id" }, { status: 400 });
  const appt = await db.crmAppointment.findUnique({ where: { id: String(id) } });
  if (!appt) return NextResponse.json({ ok: true }); // already gone
  const first = me.name.split(/\s+/)[0].toLowerCase();
  const mine = (appt.withWho || "").toLowerCase().includes(first);
  if (!mine && !isManager(me)) return NextResponse.json({ error: "not yours" }, { status: 403 });
  await markApptDone(appt.id, me.name);
  await db.crmEvent.create({ data: { contactId: appt.contactId || "", oppId: appt.oppId || "", kind: "appt", actor: me.name, body: `✅ Appointment done — ${appt.title}`.slice(0, 300) } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
