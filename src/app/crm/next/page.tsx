import { db } from "@/lib/db";
import { getCurrentUser, isManager, canManageAllLeads } from "@/lib/auth";
import { pipelineLockFor, readPipelines } from "@/lib/crm";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { Card, SectionTitle } from "@/components/ui";
import { commsFor } from "@/lib/crm-comms";
import NextUpRow from "@/components/NextUpRow";
import CrmQuickView from "@/components/CrmQuickView";
import Link from "next/link";

export const dynamic = "force-dynamic";

// ⚡ "Next Up" — the single prioritized work queue for acquisitions (Jon
// 2026-10-13, from the CRM-upgrade roadmap). One screen that answers "who do I
// call next?" so no lead stalls: newest uncontacted leads first (speed-to-lead),
// then sellers who texted back, then overdue follow-ups. Pure read, no schema.
export default async function NextUpPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return <Card className="p-10 text-center text-slate-400">Next Up is for acquisitions + managers.</Card>;
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const canViewAll = canManageAllLeads(me!);
  const sp = await searchParams;
  // Who's queue (Jon 2026-10-15): managers can view Everyone, Me, or any rep —
  // same filters as the CRM, up top-left so it's viewable per person.
  const reps = canViewAll ? await db.user.findMany({ where: { active: true, position: { in: ["acquisitions", "cc_lm", "dispositions"] } }, select: { name: true }, orderBy: { name: "asc" } }) : [];
  const everyone = canViewAll && sp.who === "all";
  const who = canViewAll ? (sp.who === "all" ? "" : (sp.who ?? me!.name)) : me!.name;
  const comms = await commsFor(me!);
  const ownerWhere = everyone ? {} : { assignedTo: { equals: who, mode: "insensitive" as const } };
  // 🔒 Pipeline isolation (Jon 2026-10-19): a pipeline-locked rep (e.g. Kyle, Nick)
  // only ever sees leads from their own pipeline(s) — here too, not just the board —
  // so Next Up can be shown to them without leaking everyone else's leads.
  const lockPipes = await pipelineLockFor(me!);
  const pipeIn = lockPipes?.length ? (lockPipes.includes("War Room") ? [...lockPipes, ""] : lockPipes) : null;
  const pipeWhere = pipeIn ? { pipeline: { in: pipeIn } } : {};
  // Pipeline stages for the slide-in quick-view (so it can render the stage dropdown
  // for whichever pipeline a lead belongs to).
  const pipelines = await readPipelines();
  const pipelineStages = Object.fromEntries(pipelines.map((p) => [p.name, p.stages.map((s) => ({ key: s.key, label: s.label }))]));
  const qvStages = pipelines[0]?.stages.map((s) => ({ key: s.key, label: s.label })) ?? [];

  // candidate opps: new-stage + due follow-ups + stalled working deals (bounded)
  const staleCut = new Date(Date.now() - 3 * 86400000);
  const [newLeads, dueFollowups, stalled] = await Promise.all([
    db.crmOpportunity.findMany({ where: { stage: "new", archivedAt: null, ...ownerWhere, ...pipeWhere }, orderBy: { createdAt: "asc" }, take: 80, select: { id: true, contactId: true, createdAt: true, contact: { select: { name: true, phone: true, address: true } } } }),
    db.crmOpportunity.findMany({ where: { nextFollowUp: { not: "", lte: today }, archivedAt: null, ...ownerWhere, ...pipeWhere }, orderBy: { nextFollowUp: "asc" }, take: 60, select: { id: true, contactId: true, nextFollowUp: true, contact: { select: { name: true, phone: true, address: true } } } }),
    // 🕸 working deals with no activity in 3+ days (losing momentum → slower close)
    db.crmOpportunity.findMany({ where: { stage: { notIn: ["new", "nurture", "dead"] }, updatedAt: { lte: staleCut }, archivedAt: null, ...ownerWhere, ...pipeWhere }, orderBy: { updatedAt: "asc" }, take: 40, select: { id: true, contactId: true, stage: true, updatedAt: true, contact: { select: { name: true, phone: true, address: true } } } }),
  ]);
  const stalledClean = stalled.filter((o) => !/sign|won|dead|nurtur/i.test(o.stage));
  const daysStale = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86400000);

  // which new leads have NEVER been called (no outbound/browser call) = top priority
  const newCids = [...new Set(newLeads.map((o) => o.contactId))];
  const calls = newCids.length ? await db.crmEvent.findMany({ where: { contactId: { in: newCids }, kind: "call", body: { startsWith: "Browser call" } }, select: { contactId: true } }) : [];
  const calledCids = new Set(calls.map((c) => c.contactId));
  // sellers who texted back and we haven't replied (hottest) — inbound sms after last outbound
  const smsCids = newCids.concat(dueFollowups.map((o) => o.contactId));
  const inbound = smsCids.length ? await db.crmEvent.findMany({ where: { contactId: { in: [...new Set(smsCids)] }, kind: "sms" }, orderBy: { at: "desc" }, take: 800, select: { contactId: true, body: true } }) : [];
  const repliedBack = new Set<string>();
  const seen = new Set<string>();
  for (const e of inbound) { if (seen.has(e.contactId)) continue; seen.add(e.contactId); if (e.body.startsWith("⬅")) repliedBack.add(e.contactId); }

  const hrsAgo = (d: Date) => Math.max(0, Math.round((Date.now() - d.getTime()) / 3600_000));
  // 1) 🔥 new + never called, oldest first
  const uncontacted = newLeads.filter((o) => !calledCids.has(o.contactId));
  // 2) 💬 texted us back (across new + followups)
  const repliedList = [...newLeads, ...dueFollowups].filter((o) => repliedBack.has(o.contactId));
  const repliedIds = new Set(repliedList.map((o) => o.id));
  // 3) ⏰ overdue follow-ups (not already in replied)
  const overdue = dueFollowups.filter((o) => !repliedIds.has(o.contactId));

  type QItem = { id: string; contactId: string; createdAt?: Date; nextFollowUp?: string; contact: { name: string; phone: string; address: string } };
  const Section = ({ title, hint, items, tone, reason, subFn }: { title: string; hint: string; items: QItem[]; tone: "red" | "amber" | "sky"; reason: (o: QItem) => string; subFn: (o: QItem) => string }) => (
    <Card className="p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-sm font-extrabold text-slate-800">{title} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{items.length}</span></div>
        <div className="text-[11px] text-slate-400">{hint}</div>
      </div>
      {items.length === 0 ? <div className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">Nothing here — nice. ✅</div> : (
        <div className="space-y-2">
          {items.slice(0, 25).map((o) => (
            <NextUpRow key={o.id} id={o.id} contactId={o.contactId} name={o.contact.name} phone={o.contact.phone} address={o.contact.address}
              reason={reason(o)} sub={subFn(o)} tone={tone} canCall={comms.call} canSms={comms.sms} />
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* 🪟 Same slide-in quick-view the pipeline cards use — opened by the row's
          name / 📝 / 💬 buttons via the fo-quickview event. */}
      <CrmQuickView stages={qvStages} pipelineStages={pipelineStages} />
      <SectionTitle title="⚡ Next Up" subtitle="Who to work next — newest uncontacted leads first, sellers who texted back, then overdue follow-ups. Clear the top of the list and deals sign faster." accent="bg-brand-gold" />
      {canViewAll && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href="/crm/next?who=all" className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${everyone ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>Everyone</Link>
          <Link href="/crm/next" className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${who === me!.name ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>Me</Link>
          {reps.filter((r) => r.name !== me!.name).map((r) => (
            <Link key={r.name} href={`/crm/next?who=${encodeURIComponent(r.name)}`} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${who === r.name ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{r.name.split(" ")[0]}</Link>
          ))}
        </div>
      )}
      <Section title="💬 Texted us back — reply now" hint="Seller replied and is waiting" items={repliedList} tone="red" reason={() => "replied"} subFn={() => "Hot — they're engaged"} />
      <Section title="🔥 New leads to call" hint="Speed-to-lead — call within minutes" items={uncontacted} tone="amber" reason={(o) => { const h = o.createdAt ? hrsAgo(o.createdAt) : 0; return h < 1 ? "brand new" : `${h}h waiting`; }} subFn={(o) => `In the system ${o.createdAt ? hrsAgo(o.createdAt) : 0}h, never called`} />
      <Section title="⏰ Follow-ups due" hint="You said you'd follow up by today" items={overdue} tone="sky" reason={() => "follow-up due"} subFn={(o) => `Follow-up was due ${o.nextFollowUp ?? ""}`} />
      <Section title="🕸 Stalled — nudge these" hint="Working deals going quiet — momentum = faster close" items={stalledClean.map((o) => ({ id: o.id, contactId: o.contactId, contact: o.contact, nextFollowUp: undefined, createdAt: o.updatedAt }))} tone="amber" reason={(o) => `${o.createdAt ? daysStale(o.createdAt) : 0}d quiet`} subFn={(o) => `No activity in ${o.createdAt ? daysStale(o.createdAt) : 0} days`} />
    </div>
  );
}
