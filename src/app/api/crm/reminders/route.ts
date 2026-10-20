import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { readTaskTimes } from "@/lib/task-times";

export const dynamic = "force-dynamic";

// 🔔 Reminders feed (Jon 2026-10-20: "no reason anyone misses a task or appointment —
// pop it on their screen and keep nagging"). Returns the CURRENT user's upcoming
// appointments + open tasks due today, each with a precise time when one is set, so
// the client can fire escalating pop-ups as the time approaches. Appt = red, task =
// green. Scoped to the person it's assigned to (appt.withWho / task.assignedTo).
export async function GET() {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ appts: [], tasks: [] }, { headers: { "Cache-Control": "private, no-store" } });

  const TZ = "America/Los_Angeles";
  const orgDate = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const first = me!.name.split(/\s+/)[0];
  const now = Date.now();

  const [apptRows, taskRows] = await Promise.all([
    // Upcoming (or just-started) appointments assigned to me — next 14h, plus any
    // that started in the last 20 min (so a missed one still nags).
    db.crmAppointment.findMany({
      where: { withWho: { contains: first, mode: "insensitive" }, at: { gte: new Date(now - 20 * 60000), lte: new Date(now + 14 * 3600000) } },
      select: { id: true, title: true, at: true, oppId: true, contactId: true },
      orderBy: { at: "asc" }, take: 40,
    }),
    // Open tasks assigned to me, due today-or-overdue.
    db.crmTask.findMany({
      where: { doneAt: null, assignedTo: { equals: me!.name, mode: "insensitive" }, due: { not: "", lte: `${orgDate}T23:59` } },
      select: { id: true, title: true, due: true, oppId: true, contactId: true },
      orderBy: { due: "asc" }, take: 50,
    }),
  ]);

  const cids = [...new Set([...apptRows, ...taskRows].map((r) => r.contactId).filter(Boolean))];
  const contacts = cids.length ? await db.crmContact.findMany({ where: { id: { in: cids } }, select: { id: true, name: true } }) : [];
  const cname = new Map(contacts.map((c) => [c.id, c.name]));
  const times = await readTaskTimes();

  return NextResponse.json({
    who: first,
    nowIso: new Date().toISOString(),
    appts: apptRows.map((a) => ({ id: a.id, title: a.title, atIso: a.at.toISOString(), oppId: a.oppId, lead: cname.get(a.contactId) || "" })),
    tasks: taskRows.map((t) => ({ id: t.id, title: t.title, due: t.due, time: times[t.id] || "", oppId: t.oppId, lead: cname.get(t.contactId) || "" })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
