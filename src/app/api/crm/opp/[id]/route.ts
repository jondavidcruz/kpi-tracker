import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { stripHtml } from "@/lib/crm-shared";

export const dynamic = "force-dynamic";

// Quick-view payload for the board drawer (GHL-style peek without leaving
// the pipeline).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ error: "no access" }, { status: 403 });
  const { id } = await params;
  const opp = await db.crmOpportunity.findUnique({ where: { id }, include: { contact: true } });
  if (!opp) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!isManager(me!) && opp.assignedTo && opp.assignedTo !== me!.name) return NextResponse.json({ error: "not your lead" }, { status: 403 });
  const [events, tasks] = await Promise.all([
    db.crmEvent.findMany({ where: { contactId: opp.contactId }, orderBy: { at: "desc" }, take: 8 }),
    db.crmTask.findMany({ where: { oppId: id, doneAt: null }, orderBy: { due: "asc" }, take: 5 }),
  ]);
  return NextResponse.json({
    id: opp.id, title: opp.title, stage: opp.stage, pipeline: opp.pipeline, assignedTo: opp.assignedTo,
    tags: opp.tags, nextFollowUp: opp.nextFollowUp, value: opp.value, askPrice: opp.askPrice,
    contact: { id: opp.contact.id, name: opp.contact.name, phone: opp.contact.phone, altPhone: opp.contact.altPhone, email: opp.contact.email, pinnedNote: opp.contact.pinnedNote },
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, due: t.due })),
    events: events.map((e) => ({ kind: e.kind, body: stripHtml(e.body).slice(0, 220), actor: e.actor, at: e.at.toISOString() })),
  });
}
