import Link from "next/link";
import { getCurrentUser, canAccessMarketing, isManager } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { readPipelines } from "@/lib/crm";
import { formatAddress } from "@/lib/address";
import { Card, SectionTitle } from "@/components/ui";
import { readDispoBuyers, isDispoPipeline, DISPO_BUYER_STAGES } from "@/lib/dispo-buyers";
import DispoFollowupKanban, { type FollowupCard } from "@/components/DispoFollowupKanban";
import VettingTable, { type Prospect } from "@/components/VettingTable";
import CsvMapImport from "@/components/CsvMapImport";
import { readBuyerLand } from "@/app/actions";

export const dynamic = "force-dynamic";

type Tab = "deals" | "developers" | "agents";

// 🎯 Dispositions CRM — the dispo department's home, built like the Acquisitions
// CRM but for dispo (Jon 2026-10-20). One spot, three tabs: Developers + Buyer
// Agents (the unvetted pool, vetted with the interview cards) and Deals (the
// follow-up Kanban for everyone we've sent a deal to).
const PROSPECT_SELECT = {
  id: true, name: true, website: true, links: true, email: true, phone: true, phone2: true,
  buyBoxAreas: true, outreachLog: true, lastContacted: true, nextFollowUp: true,
  vetStage: true, vetStatus: true, igHandle: true, touchOn: true, vetArea: true,
  category: true, type: true, title: true, company: true, preferredContact: true,
  dealType: true, buildType: true, closingSpeed: true, priceRange: true, minLotSize: true,
  propertyType: true, minBeds: true, maxBaths: true, conditionTolerance: true, needsView: true,
  marketDetails: true, decisionMaker: true, buyingFrequency: true, bestContact: true, companySize: true,
} as const;

// A buyer AGENT vs a DEVELOPER / cash buyer — split the unvetted pool by this.
const isAgentType = (t: string, cat: string) => /agent|broker|buyer.?rep|realtor|listing/i.test(t) && cat !== "luxury";

export default async function DispoPage({ searchParams }: { searchParams: Promise<{ tab?: string; imp?: string; dup?: string }> }) {
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
  const sp = await searchParams;
  const tab: Tab = sp.tab === "developers" || sp.tab === "agents" ? sp.tab : "deals";
  const canEdit = canAccessMarketing(me) || isManager(me);
  const settings = await getSettings();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings.orgTimezone }).format(new Date());

  // ── The unvetted pool (developers + buyer agents), split by type ──
  const pool = await db.marketContact.findMany({
    where: { archivedAt: null, vetStage: { notIn: ["vetted", "active"] } },
    orderBy: [{ vetArea: "asc" }, { name: "asc" }],
    select: PROSPECT_SELECT,
  });
  const toProspect = (r: typeof pool[number]): Prospect => ({
    id: r.id, name: r.name, website: r.website, links: r.links, email: r.email, phone: r.phone, phone2: r.phone2,
    buyBoxAreas: r.buyBoxAreas, outreachLog: r.outreachLog, lastContacted: r.lastContacted,
    nextFollowUp: r.nextFollowUp, vetStage: r.vetStage, vetStatus: r.vetStatus, igHandle: r.igHandle, touchOn: r.touchOn,
    category: r.category, type: r.type, title: r.title, company: r.company, preferredContact: r.preferredContact,
    dealType: r.dealType, buildType: r.buildType, closingSpeed: r.closingSpeed, priceRange: r.priceRange, minLotSize: r.minLotSize,
    propertyType: r.propertyType, minBeds: r.minBeds, maxBaths: r.maxBaths, conditionTolerance: r.conditionTolerance, needsView: r.needsView,
    marketDetails: r.marketDetails, decisionMaker: r.decisionMaker, buyingFrequency: r.buyingFrequency, bestContact: r.bestContact, companySize: r.companySize,
  });
  const agents = pool.filter((r) => isAgentType(r.type, r.category));
  const developers = pool.filter((r) => !isAgentType(r.type, r.category));
  const UNASSIGNED = "Unassigned / general";
  const groupByArea = (rows: typeof pool) => {
    const m = new Map<string, Prospect[]>();
    for (const r of rows) { const k = r.vetArea || UNASSIGNED; const a = m.get(k) ?? []; a.push(toProspect(r)); m.set(k, a); }
    return Array.from(m.entries()).map(([area, prospects]) => ({ area, prospects }))
      .sort((a, b) => (a.area === UNASSIGNED ? 1 : b.area === UNASSIGNED ? -1 : b.prospects.length - a.prospects.length));
  };
  const buyerLand = await readBuyerLand().catch(() => ({} as Record<string, import("@/lib/buyer-land").BuyerLand>));

  // ── Deals tab: the follow-up Kanban across all DS-pipeline deals ──
  const pipelines = await readPipelines();
  const dispoNames = pipelines.map((p) => p.name).filter((n) => isDispoPipeline(n));
  const opps = dispoNames.length
    ? await db.crmOpportunity.findMany({ where: { archivedAt: null, pipeline: { in: dispoNames } }, select: { id: true, title: true, formData: true, contact: { select: { name: true, address: true } } } })
    : [];
  const cards: FollowupCard[] = [];
  for (const o of opps) {
    const dealAddr = formatAddress(o.contact?.address || "") || o.title || o.contact?.name || "deal";
    for (const b of readDispoBuyers(o.formData)) cards.push({ oppId: o.id, entryId: b.id, name: b.name, kind: b.kind, phone: b.phone, email: b.email, price: b.price, stage: b.stage, nextFollowUp: b.nextFollowUp, lastContact: b.lastContact, dealAddr });
  }
  const dueToday = cards.filter((c) => c.nextFollowUp && c.nextFollowUp <= today && c.stage !== "passed" && c.stage !== "offer_in").length;

  const TABS: { key: Tab; label: string; n: number }[] = [
    { key: "deals", label: "📇 Deals & follow-ups", n: cards.length },
    { key: "developers", label: "🏗 Developers", n: developers.length },
    { key: "agents", label: "🧑‍💼 Buyer agents", n: agents.length },
  ];

  const importPanel = (
    <details className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <summary className="cursor-pointer text-sm font-bold text-slate-700">📥 Import from a CSV <span className="font-normal text-slate-400">— the Excel unvetted list; auto-maps columns, skips anyone already here</span></summary>
      <p className="mt-2 mb-3 text-xs text-slate-500">Upload the <b>unvetted-developers-backfill.csv</b> (or any CSV). We auto-guess the columns, you confirm, then import. Buyer agents and developers split into their tabs automatically by the Type column. Re-uploading is safe — duplicates are skipped.</p>
      <CsvMapImport returnTo={`/dispo?tab=${tab}`} />
    </details>
  );

  return (
    <div className="space-y-5">
      <SectionTitle
        title="🎯 Dispositions CRM"
        subtitle="Dispo's home base — like the Acquisitions CRM, but for dispositions. Developers + buyer agents in one spot (vet them with the interview cards), and every deal's buyer follow-up on the Deals board."
        accent="bg-emerald-500"
        right={<Link href="/crm?pl=DS%3A%20Sell%20Land%20Then%20Sign" className="rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-navy-700">→ Deal pipelines</Link>}
      />

      {sp.imp && /^\d+$/.test(sp.imp) && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Imported {sp.imp} into the pool.{sp.dup && /^\d+$/.test(sp.dup) ? ` Skipped ${sp.dup} already here.` : ""} They&apos;re split into Developers / Buyer agents by type.</div>}

      {/* tab bar */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link key={t.key} href={`/dispo?tab=${t.key}`} prefetch={false}
            className={`rounded-full px-3 py-1.5 text-sm font-bold ring-1 ${tab === t.key ? "bg-brand-navy text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>
            {t.label} <span className={`ml-1 rounded-full px-1.5 text-[11px] ${tab === t.key ? "bg-white/20" : "bg-slate-100"}`}>{t.n}</span>
          </Link>
        ))}
      </div>

      {tab === "deals" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-slate-800">{cards.length}</div><div className="text-[11px] font-semibold text-slate-500">Buyers / agents in play</div></Card>
            <Card className="p-3 text-center"><div className={`text-2xl font-extrabold tabular-nums ${dueToday ? "text-red-600" : "text-slate-800"}`}>{dueToday}</div><div className="text-[11px] font-semibold text-slate-500">Follow-ups due today</div></Card>
            <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-emerald-700">{cards.filter((c) => c.stage === "offer_in").length}</div><div className="text-[11px] font-semibold text-slate-500">💵 Price / offer in</div></Card>
          </div>
          {cards.length === 0 ? (
            <Card className="p-8 text-center text-slate-500">
              <div className="mb-2 text-3xl">📇</div>
              <p className="text-sm font-semibold text-slate-700">No buyers on the board yet.</p>
              <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-500">Open a deal in the <b>DS: Sell Land Then Sign</b> pipeline, hit <b>Send to buyers</b> (or add buyer agents + developers by hand) on the deal&apos;s <b>📇 Buyers &amp; agents</b> panel, and they show up here to work.</p>
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
        </>
      )}

      {tab === "developers" && (
        <>
          {importPanel}
          {developers.length === 0 && <Card className="p-6 text-center text-sm text-slate-400">No developers in the pool yet — import the Excel list above.</Card>}
          <VettingTable areas={groupByArea(developers)} canEdit={canEdit} today={today} land={buyerLand} />
        </>
      )}

      {tab === "agents" && (
        <>
          {importPanel}
          {agents.length === 0 && <Card className="p-6 text-center text-sm text-slate-400">No buyer agents in the pool yet — import the Excel list above (rows with an agent/broker Type land here).</Card>}
          <VettingTable areas={groupByArea(agents)} canEdit={canEdit} today={today} land={buyerLand} />
        </>
      )}
    </div>
  );
}
