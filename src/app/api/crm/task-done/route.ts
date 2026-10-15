import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager, isLeadership, LEADERSHIP_ASSIGNEE } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ✓ Mark one task done from the start/end-of-day popup (Jon 2026-10-15). Allowed
// when it's assigned to me, it's a shared Leadership task and I'm leadership, or
// I'm a manager. Mirrors CrmEvent logging so completions show on the activity feed.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "no auth" }, { status: 401 });
  const { id } = await req.json().catch(() => ({ id: "" }));
  if (!id) return NextResponse.json({ error: "no id" }, { status: 400 });
  const task = await db.crmTask.findUnique({ where: { id: String(id) } });
  if (!task || task.doneAt) return NextResponse.json({ ok: true }); // already gone/done
  const mineName = task.assignedTo.toLowerCase() === me.name.toLowerCase();
  const sharedLead = task.assignedTo === LEADERSHIP_ASSIGNEE && isLeadership(me);
  if (!mineName && !sharedLead && !isManager(me)) return NextResponse.json({ error: "not yours" }, { status: 403 });
  await db.crmTask.update({ where: { id: task.id }, data: { doneAt: new Date(), doneBy: me.name } });
  await db.crmEvent.create({ data: { contactId: task.contactId || "", oppId: task.oppId || "", kind: "task", actor: me.name, body: `✅ ${task.title}`.slice(0, 300) } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
