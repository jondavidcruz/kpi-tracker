import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager, isLeadership, LEADERSHIP_ASSIGNEE } from "@/lib/auth";
import { shiftEndAt, shiftEndLabel } from "@/lib/shift";

export const dynamic = "force-dynamic";

// 📋 My day's tasks (Jon 2026-10-15) — powers the start-of-day and end-of-day
// popups. Returns the current user's open tasks due today-or-overdue, the shared
// 🏛 Leadership queue (for leadership), and the user's shift-end instant so the
// client knows when to fire the end-of-day "did you finish?" check (Nick/Kyle 12pm).
export async function GET() {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ error: "no access" }, { status: 403 });
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = `${today}T23:59`; // include timed-today + overdue
  const lead = isLeadership(me);
  const [mine, leadTasks] = await Promise.all([
    db.crmTask.findMany({ where: { doneAt: null, assignedTo: { equals: me!.name, mode: "insensitive" }, due: { not: "", lte: cutoff } }, select: { id: true, title: true, due: true }, orderBy: { due: "asc" }, take: 50 }),
    lead ? db.crmTask.findMany({ where: { doneAt: null, assignedTo: LEADERSHIP_ASSIGNEE, due: { not: "", lte: cutoff } }, select: { id: true, title: true, due: true }, orderBy: { due: "asc" }, take: 50 }) : Promise.resolve([]),
  ]);
  // Shift-end instant (computed on the org-local date) → when the EOD popup fires.
  const orgDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const endAt = shiftEndAt(orgDate, "America/New_York", me!.name);
  return NextResponse.json({
    who: me!.name.split(" ")[0],
    isLead: lead,
    tasks: mine,
    leadershipTasks: leadTasks,
    shiftEndIso: endAt ? endAt.toISOString() : null,
    shiftEndLabel: shiftEndLabel(orgDate, me!.name),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
