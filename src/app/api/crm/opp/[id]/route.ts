import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager, canManageAllLeads } from "@/lib/auth";
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
  const followersList = Array.isArray((opp.formData as Record<string, unknown> | null)?.__followers) ? ((opp.formData as Record<string, unknown>).__followers as string[]) : [];
  if (!canManageAllLeads(me!) && opp.assignedTo && opp.assignedTo !== me!.name && !followersList.includes(me!.name)) return NextResponse.json({ error: "not your lead" }, { status: 403 });
  const { commsFor, readSignatures, firstOf, defaultSignature, hasSignatureImage } = await import("@/lib/crm-comms");
  const { readSnippets } = await import("@/lib/crm-templates");
  const [events, tasks, appts, comms, sigs, snippets, smsEvents, emailEvents] = await Promise.all([
    db.crmEvent.findMany({ where: { contactId: opp.contactId }, orderBy: { at: "desc" }, take: 40 }),
    // Open tasks first (doneAt null), then completed ones kept as checked-off history
    // with who/when (Jon 2026-10-27: "don't delete — show when they completed it").
    db.crmTask.findMany({ where: { oppId: id }, orderBy: [{ doneAt: { sort: "desc", nulls: "first" } }, { due: "asc" }], take: 30 }),
    db.crmAppointment.findMany({ where: { oppId: id, at: { gte: new Date(Date.now() - 86400_000) } }, orderBy: { at: "asc" }, take: 8 }),
    commsFor(me!),
    readSignatures(),
    readSnippets(),
    db.crmEvent.findMany({ where: { contactId: opp.contactId, kind: "sms" }, orderBy: { at: "desc" }, take: 15 }),
    db.crmEvent.findMany({ where: { contactId: opp.contactId, kind: "email" }, orderBy: { at: "desc" }, take: 8 }),
  ]);
  // Saved underwriting for THIS property (matched by address) — powers the
  // Financials & Offer tab: MAO per exit + offer-vs-accepted + negotiation tips.
  const { readUnderwrites } = await import("@/app/actions");
  const { addrMatch } = await import("@/lib/underwrite-history");
  const fd = (opp.formData ?? {}) as Record<string, Record<string, string | string[]>>;
  const leadAddr = opp.contact.address || String(fd.discovery?.address ?? "") || opp.title;
  // Match an exported offer to this card by its exact oppId link first (reliable —
  // Jon 2026-10-20), then fall back to address match for offers run before the link.
  const underwrites = (await readUnderwrites().catch(() => []))
    .filter((u) => u.oppId === opp.id || (u.address && addrMatch(u.address, leadAddr)))
    .slice(0, 8)
    .map((u) => ({ tab: u.tab, mao: u.mao, fee: u.fee, confidence: u.confidence, by: u.by, at: u.at }));

  const clean = (b: string) => stripHtml(b).replace(/^[⬅➡️️\s]*(Seller|Us):\s*/u, "").slice(0, 400);
  const smsHistory = [...smsEvents].reverse().map((e) => ({ body: clean(e.body), inbound: stripHtml(e.body).startsWith("⬅"), at: e.at.toISOString() }));
  const emailHistory = [...emailEvents].reverse().map((e) => ({ body: clean(e.body), inbound: stripHtml(e.body).startsWith("⬅"), at: e.at.toISOString(), actor: e.actor }));
  // Move list: hide the buyer-NETWORK pipelines (DS: Unvetted Developers / Buyer
  // Agents) from a seller/deal lead — you never move a seller into the buyer network
  // (Jon 2026-10-21). A network lead itself still sees them (to switch dev↔agent).
  const { isDispoNetworkPipeline } = await import("@/lib/dispo-buyers");
  const curIsNetwork = isDispoNetworkPipeline(opp.pipeline);
  const pipelineNames = (await (await import("@/lib/crm")).readPipelines()).map((x) => x.name)
    .filter((n) => curIsNetwork || !isDispoNetworkPipeline(n));
  return NextResponse.json({
    me: {
      name: me!.name,
      fromLabel: `${me!.name} <${firstOf(me!.name)}@freedom-offers.com>`,
      signature: sigs[firstOf(me!.name)] || defaultSignature(me!.name),
      // 🖼 the uploaded signature IMAGE (Jon 2026-10-27: only the text sig was showing in the composer)
      sigImageUrl: (await hasSignatureImage(firstOf(me!.name))) ? `/api/sig/${encodeURIComponent(firstOf(me!.name))}` : "",
      canSms: comms.sms, canEmail: comms.email, canCall: comms.call,
    },
    snippets: snippets.map((s) => ({ id: s.id, name: s.name, kind: s.kind, subject: s.subject, body: s.body })),
    smsHistory, emailHistory, underwrites,
    offers: Array.isArray((fd as Record<string, unknown>).__offers) ? (fd as Record<string, unknown>).__offers : [],
    followers: followersList,
    reps: (await db.user.findMany({ where: { active: true }, select: { name: true }, orderBy: { name: "asc" } })).map((u) => u.name),
    pipelines: pipelineNames,
    id: opp.id, title: opp.title, stage: opp.stage, pipeline: opp.pipeline || "War Room", assignedTo: opp.assignedTo,
    tags: opp.tags, nextFollowUp: opp.nextFollowUp, value: opp.value, askPrice: opp.askPrice,
    formData: (opp.formData ?? {}) as Record<string, Record<string, string | string[]>>,
    contact: {
      id: opp.contact.id, name: opp.contact.name, phone: opp.contact.phone, altPhone: opp.contact.altPhone,
      email: opp.contact.email, altEmail: opp.contact.altEmail, address: opp.contact.address, pinnedNote: opp.contact.pinnedNote, tags: opp.contact.tags,
    },
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, due: t.due, assignedTo: t.assignedTo, doneAt: t.doneAt ? t.doneAt.toISOString() : null, doneBy: t.doneBy })),
    appts: appts.map((a) => ({ id: a.id, title: a.title, at: a.at.toISOString(), withWho: a.withWho })),
    events: events.map((e) => {
      const m = e.meta as { link?: string; name?: string; transcript?: string } | null;
      const isRec = e.body.startsWith("🎙") && !!m?.link;
      return {
        id: e.id, kind: e.kind, body: stripHtml(e.body).slice(0, 600), actor: e.actor, at: e.at.toISOString(),
        ...(m?.link && !e.body.startsWith("🎙") ? { link: m.link, fileName: m.name } : {}),
        ...(isRec ? { recLink: m!.link, transcript: (m!.transcript || "").slice(0, 6000) } : {}),
      };
    }),
  });
}
