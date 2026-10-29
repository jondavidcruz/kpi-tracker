// 🔎 CRM Audit — "find the leaks" (Jonathan Duong call 2026-10-28: use AI to audit the CRM
// for system failures so no revenue is lost). Read-only. Scans for overdue follow-ups, quiet
// active leads, leads with no next action, unvetted mom & pop developers, and signed deals
// with no buyers attached. C-suite only.
import { getCurrentUser, isCSuitePerson } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayStr } from "@/lib/date";
import { readDispoBuyers, isDispoDealPipeline } from "@/lib/dispo-buyers";
import { resolveNetworkPipelines } from "@/lib/dispo-network";
import { classifyBuilderSize } from "@/lib/builder-size";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const DEAD = /dnc|litigator|tcpa|hostile|no buyer|not interest|\bdead\b|overpric|nurtur|signed|won|closed|escrow/i;

function Leak({ emoji, title, count, blurb, sample }: { emoji: string; title: string; count: number; blurb: string; sample: { id: string; label: string; meta?: string }[] }) {
  return (
    <Card className={`p-4 ${count > 0 ? "border-l-4 border-amber-400" : "border-l-4 border-emerald-400"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-bold text-slate-800">{emoji} {title}</div>
        <div className={`rounded-full px-2.5 py-0.5 text-sm font-extrabold ${count > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{count}</div>
      </div>
      <div className="mt-0.5 text-[12px] text-slate-500">{blurb}</div>
      {sample.length > 0 && (
        <div className="mt-2 space-y-1">
          {sample.map((s) => (
            <a key={s.id} href={`/crm/${s.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] ring-1 ring-slate-100 hover:bg-slate-100">
              <span className="min-w-0 truncate font-semibold text-slate-700">{s.label}</span>
              {s.meta && <span className="shrink-0 text-[10px] text-slate-400">{s.meta}</span>}
            </a>
          ))}
          {count > sample.length && <div className="text-[11px] text-slate-400">+ {count - sample.length} more…</div>}
        </div>
      )}
    </Card>
  );
}

export default async function CrmAuditPage() {
  const me = await getCurrentUser();
  if (!isCSuitePerson(me)) {
    return <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><div className="mb-2 text-3xl">🔒</div><h1 className="text-xl font-bold">C-suite only</h1><p className="mt-2 text-sm text-slate-500">The CRM audit is limited to the C-suite.</p></div>;
  }
  const today = todayStr();
  const quietCut = new Date(Date.now() - 21 * 86400000);

  // 1) ⏰ Overdue follow-ups — a follow-up date in the past, lead still active.
  const overdue = await db.crmOpportunity.findMany({
    where: { archivedAt: null, nextFollowUp: { not: "", lt: today } },
    select: { id: true, title: true, assignedTo: true, nextFollowUp: true, contact: { select: { name: true } } },
    orderBy: { nextFollowUp: "asc" }, take: 500,
  });

  // 2) 🕸 Quiet active leads — not updated in 21+ days and not in a dead/nurture/closed stage.
  const quietRaw = await db.crmOpportunity.findMany({
    where: { archivedAt: null, updatedAt: { lt: quietCut } },
    select: { id: true, title: true, stage: true, pipeline: true, updatedAt: true, contact: { select: { name: true } } },
    orderBy: { updatedAt: "asc" }, take: 800,
  });
  const quiet = quietRaw.filter((o) => !DEAD.test(`${o.stage} ${o.pipeline}`));

  // 3) 🚫 No next action — active lead with no follow-up date AND no open task.
  const activeNoFu = await db.crmOpportunity.findMany({
    where: { archivedAt: null, OR: [{ nextFollowUp: "" }, { nextFollowUp: { equals: "" } }] },
    select: { id: true, title: true, pipeline: true, stage: true, assignedTo: true, contact: { select: { name: true } } },
    take: 1500,
  });
  const liveNoFu = activeNoFu.filter((o) => !DEAD.test(`${o.stage} ${o.pipeline}`));
  const openTaskOpps = new Set((await db.crmTask.findMany({ where: { doneAt: null, oppId: { in: liveNoFu.map((o) => o.id) } }, select: { oppId: true } })).map((t) => t.oppId));
  const noAction = liveNoFu.filter((o) => !openTaskOpps.has(o.id));

  // 4) 🏠 Unvetted mom & pop developers — the work-first backlog.
  const net = await resolveNetworkPipelines();
  const devOpps = net.dev.length ? await db.crmOpportunity.findMany({
    where: { archivedAt: null, pipeline: { in: net.dev }, stage: { notIn: ["vetted", "not_fit"] } },
    select: { id: true, title: true, formData: true, contact: { select: { name: true } } }, take: 3000,
  }) : [];
  const momUnvetted = devOpps.filter((o) => {
    const fd = (o.formData ?? {}) as Record<string, unknown>;
    const bb = (fd.__buyBoxStruct ?? null) as { geo?: { nationwide?: boolean; states?: string[] }; status?: { volume_note?: string } } | null;
    return classifyBuilderSize({ name: o.contact?.name || o.title, override: (fd.__builderSize as string | undefined) ?? null, nationwide: bb?.geo?.nationwide === true, statesCount: bb?.geo?.states?.length ?? 0, volumeText: bb?.status?.volume_note || "" }) === "mompop";
  });

  // 5) 📦 Dispo deals with NO buyers attached — signed/working deals nobody's being sent.
  const dealOpps = await db.crmOpportunity.findMany({
    where: { archivedAt: null },
    select: { id: true, title: true, pipeline: true, stage: true, formData: true, contact: { select: { name: true } } },
    orderBy: { updatedAt: "desc" }, take: 2000,
  });
  const dealsNoBuyers = dealOpps.filter((o) => isDispoDealPipeline(o.pipeline) && !/won|closed|dead|lost/i.test(o.stage) && readDispoBuyers(o.formData).length === 0);

  const samp = <T,>(arr: T[], f: (x: T) => { id: string; label: string; meta?: string }) => arr.slice(0, 6).map(f);

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">🔎 CRM Audit — find the leaks</h1>
        <p className="mt-1 text-sm text-slate-500">Read-only scan for where revenue leaks out: missed follow-ups, stalled leads, and unworked buyers. Click any lead to fix it.</p>
      </div>
      <Leak emoji="⏰" title="Overdue follow-ups" count={overdue.length} blurb="Follow-up date is in the past and the lead is still active — they're slipping." sample={samp(overdue, (o) => ({ id: o.id, label: o.contact?.name || o.title, meta: `due ${o.nextFollowUp} · ${o.assignedTo || "unassigned"}` }))} />
      <Leak emoji="🕸" title="Quiet active leads (21+ days)" count={quiet.length} blurb="No activity in 3+ weeks but still in a working stage — re-touch or move them." sample={samp(quiet, (o) => ({ id: o.id, label: o.contact?.name || o.title, meta: `${o.pipeline} · ${o.stage}` }))} />
      <Leak emoji="🚫" title="No next action set" count={noAction.length} blurb="Active lead with no follow-up date AND no open task — nothing is scheduled, so it'll be forgotten." sample={samp(noAction, (o) => ({ id: o.id, label: o.contact?.name || o.title, meta: `${o.pipeline} · ${o.stage}` }))} />
      <Leak emoji="📦" title="Dispo deals with no buyers attached" count={dealsNoBuyers.length} blurb="A working deal with nobody on its buyer tracker — it isn't being sent to anyone." sample={samp(dealsNoBuyers, (o) => ({ id: o.id, label: o.contact?.name || o.title, meta: `${o.pipeline} · ${o.stage}` }))} />
      <Leak emoji="🏠" title="Unvetted mom & pop developers" count={momUnvetted.length} blurb="Work-first builders still missing a buy box — vet them to grow the buyer base." sample={samp(momUnvetted, (o) => ({ id: o.id, label: o.contact?.name || o.title }))} />
    </div>
  );
}
