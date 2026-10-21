import Link from "next/link";
import { getCurrentUser, canAccessMarketing, isManager } from "@/lib/auth";
import { db } from "@/lib/db";
import { readPipelines } from "@/lib/crm";
import { formatAddress } from "@/lib/address";
import { Card, SectionTitle } from "@/components/ui";
import { readDispoBuyers, isDispoPipeline, DISPO_BUYER_STAGES } from "@/lib/dispo-buyers";
import DispoFollowupKanban, { type FollowupCard } from "@/components/DispoFollowupKanban";

export const dynamic = "force-dynamic";

// 🎯 Dispositions CRM — the dispo department's home. The Kanban board of every
// buyer-agent + developer we're following up with on our deals, so the follow-up
// (the hardest part of "Sell Land Then Sign") never slips and every buyer is tied
// to its deal. (Jon 2026-10-20)
export default async function DispoPage() {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me) && !isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">No access</h1>
        <p className="mt-1 text-sm text-slate-500">The Dispositions CRM is for the dispo team + managers.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }

  const pipelines = await readPipelines();
  const dispoNames = pipelines.map((p) => p.name).filter((n) => isDispoPipeline(n));

  const opps = dispoNames.length
    ? await db.crmOpportunity.findMany({
        where: { archivedAt: null, pipeline: { in: dispoNames } },
        select: { id: true, title: true, pipeline: true, formData: true, contact: { select: { name: true, address: true } } },
      })
    : [];

  const cards: FollowupCard[] = [];
  for (const o of opps) {
    const dealAddr = formatAddress(o.contact?.address || "") || o.title || o.contact?.name || "deal";
    for (const b of readDispoBuyers(o.formData)) {
      cards.push({
        oppId: o.id, entryId: b.id, name: b.name, kind: b.kind,
        phone: b.phone, email: b.email, price: b.price, stage: b.stage,
        nextFollowUp: b.nextFollowUp, lastContact: b.lastContact, dealAddr,
      });
    }
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const dueToday = cards.filter((c) => c.nextFollowUp && c.nextFollowUp <= today && c.stage !== "passed" && c.stage !== "offer_in").length;
  const offersIn = cards.filter((c) => c.stage === "offer_in").length;
  const dealsWithBuyers = new Set(cards.map((c) => c.oppId)).size;

  return (
    <div className="space-y-5">
      <SectionTitle
        title="🎯 Dispositions CRM"
        subtitle="Your follow-up board for every buyer agent + developer we've sent a deal to. Drag cards across the sequence, log touches, and capture what each will pay — then take the best number back to the seller to sign."
        accent="bg-emerald-500"
        right={
          <div className="flex flex-wrap gap-2">
            <Link href="/crm?pl=DS%3A%20Sell%20Land%20Then%20Sign" className="rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-navy-700">→ Deal pipelines</Link>
            <Link href="/vetting" className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200">🔎 Vet developers</Link>
            <Link href="/playbooks" className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200">📘 SOP</Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-slate-800">{cards.length}</div><div className="text-[11px] font-semibold text-slate-500">Buyers / agents in play</div></Card>
        <Card className="p-3 text-center"><div className={`text-2xl font-extrabold tabular-nums ${dueToday ? "text-red-600" : "text-slate-800"}`}>{dueToday}</div><div className="text-[11px] font-semibold text-slate-500">Follow-ups due today</div></Card>
        <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-emerald-700">{offersIn}</div><div className="text-[11px] font-semibold text-slate-500">💵 Price / offer in</div></Card>
        <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-slate-800">{dealsWithBuyers}</div><div className="text-[11px] font-semibold text-slate-500">Deals being worked</div></Card>
      </div>

      {cards.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">
          <div className="mb-2 text-3xl">📇</div>
          <p className="text-sm font-semibold text-slate-700">No buyers on the board yet.</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-500">
            Open a deal in the <b>DS: Sell Land Then Sign</b> pipeline, hit <b>Send to buyers</b> (or add buyer agents + developers by hand) on the deal&apos;s <b>📇 Buyers &amp; agents</b> panel, and they&apos;ll show up here to work.
          </p>
          <Link href="/crm?pl=DS%3A%20Sell%20Land%20Then%20Sign" className="mt-4 inline-block rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white">Open the deal pipeline</Link>
        </Card>
      ) : (
        <Card className="p-3">
          <DispoFollowupKanban cards={cards} today={today} />
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
            {DISPO_BUYER_STAGES.map((s) => <span key={s.key}><span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${s.dot}`} />{s.label}</span>)}
          </div>
        </Card>
      )}
    </div>
  );
}
