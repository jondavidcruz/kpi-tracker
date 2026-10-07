import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { stripHtml } from "@/lib/crm-shared";

export const dynamic = "force-dynamic";

// Quick-view payload for the board drawer (GHL-style edit panel without
// leaving the pipeline): everything the tabbed editor needs in one fetch.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ error: "no access" }, { status: 403 });
  const { id } = await params;
  const opp = await db.crmOpportunity.findUnique({ where: { id }, include: { contact: true } });
  if (!opp) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!isManager(me!) && opp.assignedTo && opp.assignedTo !== me!.name) return NextResponse.json({ error: "not your lead" }, { status: 403 });
  const { commsFor, readSignatures, firstOf, defaultSignature } = await import("@/lib/crm-comms");
  const { readSnippets } = await import("@/lib/crm-templates");
  const [events, tasks, appts, comms, sigs, snippets] = await Promise.all([
    db.crmEvent.findMany({ where: { contactId: opp.contactId }, orderBy: { at: "desc" }, take: 10 }),
    db.crmTask.findMany({ where: { oppId: id, doneAt: null }, orderBy: { due: "asc" }, take: 10 }),
    db.crmAppointment.findMany({ where: { oppId: id, at: { gte: new Date(Date.now() - 86400_000) } }, orderBy: { at: "asc" }, take: 8 }),
    commsFor(me!),
    readSignatures(),
    readSnippets(),
  ]);
  return NextResponse.json({
    me: {
      name: me!.name,
      fromLabel: `${me!.name} <${firstOf(me!.name)}@freedom-offers.com>`,
      signature: sigs[firstOf(me!.name)] || defaultSignature(me!.name),
      canSms: comms.sms, canEmail: comms.email,
    },
    snippets: snippets.map((s) => ({ id: s.id, name: s.name, kind: s.kind, subject: s.subject, body: s.body })),
    id: opp.id, title: opp.title, stage: opp.stage, pipeline: opp.pipeline || "War Room", assignedTo: opp.assignedTo,
    tags: opp.tags, nextFollowUp: opp.nextFollowUp, value: opp.value, askPrice: opp.askPrice,
    formData: (opp.formData ?? {}) as Record<string, Record<string, string | string[]>>,
    contact: {
      id: opp.contact.id, name: opp.contact.name, phone: opp.contact.phone, altPhone: opp.contact.altPhone,
      email: opp.contact.email, altEmail: opp.contact.altEmail, address: opp.contact.address, pinnedNote: opp.contact.pinnedNote, tags: opp.contact.tags,
    },
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, due: t.due })),
    appts: appts.map((a) => ({ id: a.id, title: a.title, at: a.at.toISOString(), withWho: a.withWho })),
    events: events.map((e) => ({ kind: e.kind, body: stripHtml(e.body).slice(0, 300), actor: e.actor, at: e.at.toISOString() })),
  });
}
