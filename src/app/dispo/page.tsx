import Link from "next/link";
import { getCurrentUser, canAccessMarketing, isManager } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { readPipelines } from "@/lib/crm";
import { formatAddress } from "@/lib/address";
import { Card, SectionTitle } from "@/components/ui";
import { readDispoBuyers, isDispoDealPipeline, DISPO_BUYER_STAGES, DISPO_DEV_PIPELINE, DISPO_AGENT_PIPELINE, DISPO_NETWORK_PIPELINES } from "@/lib/dispo-buyers";
import DispoFollowupKanban, { type FollowupCard } from "@/components/DispoFollowupKanban";
import BuyerNetworkBoard, { type NetworkLead } from "@/components/BuyerNetworkBoard";
import CsvMapImport from "@/components/CsvMapImport";
import { importDispoNetworkCsv } from "@/app/actions";

export const dynamic = "force-dynamic";

type Tab = "deals" | "developers" | "agents";

// 🎯 Dispositions CRM — dispo's home, built like the Acquisitions CRM but for the
// BUYER side (Jon 2026-10-20). Three tabs: Developers + Buyer Agents are real CRM
// pipelines (each lead is a card with notes + stages), and Deals is the follow-up
// Kanban for everyone we've sent a deal to.
export default async function DispoPage({ searchParams }: { searchParams: Promise<{ tab?: string; imp?: string; dev?: string; agent?: string; dup?: string }> }) {
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
  const settings = await getSettings();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings.orgTimezone }).format(new Date());

  // Counts per network pipeline (cards = CrmOpportunity leads).
  const counts = await db.crmOpportunity.groupBy({ by: ["pipeline"], where: { archivedAt: null, pipeline: { in: [DISPO_DEV_PIPELINE, DISPO_AGENT_PIPELINE] } }, _count: { _all: true } }).catch(() => [] as { pipeline: string; _count: { _all: number } }[]);
  const countOf = (p: string) => counts.find((c) => c.pipeline === p)?._count._all ?? 0;
  const devCount = countOf(DISPO_DEV_PIPELINE);
  const agentCount = countOf(DISPO_AGENT_PIPELINE);

  // Deals tab: the follow-up Kanban across all dispo DEAL pipelines.
  const pipelines = await readPipelines();
  const dealNames = pipelines.map((p) => p.name).filter((n) => isDispoDealPipeline(n));
  const opps = dealNames.length
    ? await db.crmOpportunity.findMany({ where: { archivedAt: null, pipeline: { in: dealNames } }, select: { id: true, title: true, formData: true, contact: { select: { name: true, address: true } } } })
    : [];
  const cards: FollowupCard[] = [];
  for (const o of opps) {
    const dealAddr = formatAddress(o.contact?.address || "") || o.title || o.contact?.name || "deal";
    for (const b of readDispoBuyers(o.formData)) cards.push({ oppId: o.id, entryId: b.id, name: b.name, kind: b.kind, phone: b.phone, email: b.email, price: b.price, stage: b.stage, nextFollowUp: b.nextFollowUp, lastContact: b.lastContact, dealAddr });
  }
  const dueToday = cards.filter((c) => c.nextFollowUp && c.nextFollowUp <= today && c.stage !== "passed" && c.stage !== "offer_in").length;

  const TABS: { key: Tab; label: string; n: number }[] = [
    { key: "deals", label: "📇 Deals & follow-ups", n: cards.length },
    { key: "developers", label: "🏗 Developers", n: devCount },
    { key: "agents", label: "🧑‍💼 Buyer agents", n: agentCount },
  ];

  // Network leads for the active list tab (developers / agents) — the real CRM.
  let networkLeads: NetworkLead[] = [];
  let networkStages: { key: string; label: string }[] = [];
  if (tab === "developers" || tab === "agents") {
    const pipeline = tab === "developers" ? DISPO_DEV_PIPELINE : DISPO_AGENT_PIPELINE;
    networkStages = DISPO_NETWORK_PIPELINES.find((p) => p.name === pipeline)?.stages ?? [];
    const leadOpps = await db.crmOpportunity.findMany({
      where: { archivedAt: null, pipeline },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, stage: true, updatedAt: true, formData: true, contact: { select: { name: true, phone: true, email: true, pinnedNote: true } } },
    });
    networkLeads = leadOpps.map((o) => {
      const imp = ((o.formData ?? {}) as { __import?: { market?: string; buyBox?: string; type?: string } }).__import ?? {};
      return { id: o.id, name: o.contact?.name || o.title, phone: o.contact?.phone || undefined, email: o.contact?.email || undefined, area: imp.market || undefined, buyBox: imp.buyBox || o.contact?.pinnedNote || undefined, priceBand: undefined, stage: o.stage || "new", updatedAt: o.updatedAt.toISOString() };
    });
  }
  const importHref = (t: Tab) => `/dispo?tab=${t}`;
  const networkTab = (kind: "developers" | "agents") => {
    const n = kind === "developers" ? devCount : agentCount;
    return (
      <>
        <details className="rounded-2xl bg-white p-3 ring-1 ring-slate-200" open={n === 0}>
          <summary className="cursor-pointer text-[13px] font-bold text-slate-700">📥 Import the Excel list <span className="font-normal text-slate-400">— auto-split by Type, duplicates skipped</span></summary>
          <p className="mt-2 mb-3 text-xs text-slate-500">Upload the <b>unvetted-developers-backfill.csv</b>. Each row becomes a CRM lead with its notes; developers + buyer agents split into their tabs. Re-uploading is safe.</p>
          <CsvMapImport action={importDispoNetworkCsv} returnTo={importHref(kind)} />
        </details>
        <BuyerNetworkBoard leads={networkLeads} stages={networkStages} kindLabel={kind === "developers" ? "developers" : "buyer agents"} />
      </>
    );
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="🎯 Dispositions CRM"
        subtitle="Dispo's home base — like the Acquisitions CRM, but for the buyer side. Developers + buyer agents are full CRM leads (cards, notes, stages); the Deals board tracks every buyer follow-up per deal."
        accent="bg-emerald-500"
        right={<Link href="/crm?pl=DS%3A%20Sell%20Land%20Then%20Sign" className="rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-navy-700">→ Deal pipelines</Link>}
      />

      {sp.imp && /^\d+$/.test(sp.imp) && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Imported {sp.imp} lead{sp.imp === "1" ? "" : "s"} as CRM cards{sp.dev && sp.agent ? ` (${sp.dev} developers, ${sp.agent} buyer agents)` : ""}.{sp.dup && /^\d+$/.test(sp.dup) ? ` Skipped ${sp.dup} already here.` : ""}</div>}
      {sp.imp === "empty" && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Choose a CSV file or paste rows first.</div>}
      {sp.imp === "noname" && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Map the Name column before importing.</div>}

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
              <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-500">Open a deal in the <b>DS: Sell Land Then Sign</b> pipeline, hit <b>Send to buyers</b> (or add buyer agents + developers) on the deal&apos;s <b>📇 Buyers &amp; agents</b> panel, and they show up here to work.</p>
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

      {tab === "developers" && networkTab("developers")}
      {tab === "agents" && networkTab("agents")}
    </div>
  );
}
