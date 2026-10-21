import Link from "next/link";
import { getCurrentUser, canAccessMarketing, isManager } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { readPipelines, parseTags } from "@/lib/crm";
import { formatAddress } from "@/lib/address";
import { Card, SectionTitle } from "@/components/ui";
import { readDispoBuyers, isDispoDealPipeline, DISPO_BUYER_STAGES, DISPO_DEV_PIPELINE, DISPO_AGENT_PIPELINE, DISPO_NETWORK_PIPELINES } from "@/lib/dispo-buyers";
import DispoFollowupKanban, { type FollowupCard } from "@/components/DispoFollowupKanban";
import CrmKanban, { type CrmCard, type CrmColumn } from "@/components/CrmKanban";
import CrmQuickView from "@/components/CrmQuickView";
import CsvMapImport from "@/components/CsvMapImport";
import { importDispoNetworkCsv } from "@/app/actions";

export const dynamic = "force-dynamic";

type Tab = "deals" | "developers" | "agents";
const PALETTE = ["bg-sky-100 text-sky-800", "bg-yellow-100 text-yellow-800", "bg-violet-100 text-violet-800", "bg-amber-100 text-amber-800", "bg-emerald-100 text-emerald-800", "bg-rose-100 text-rose-600", "bg-slate-200 text-slate-600"];

// 🎯 Dispositions CRM — dispo's buyer side, built with the SAME Kanban the team
// already uses on the Seller CRM (Jon 2026-10-20: "make it look like what they
// recognize"). Developers + Buyer Agents are their own pipelines here (not mixed
// with sellers); the Deals tab tracks buyer follow-ups per deal.
export default async function DispoPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; view?: string; imp?: string; dev?: string; agent?: string; dup?: string }> }) {
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
  const listView = sp.view === "list";
  const q = (sp.q ?? "").trim();
  const settings = await getSettings();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings.orgTimezone }).format(new Date());

  const countRows = await db.crmOpportunity.groupBy({ by: ["pipeline"], where: { archivedAt: null, pipeline: { in: [DISPO_DEV_PIPELINE, DISPO_AGENT_PIPELINE] } }, _count: { _all: true } }).catch(() => [] as { pipeline: string; _count: { _all: number } }[]);
  const countOf = (p: string) => countRows.find((c) => c.pipeline === p)?._count._all ?? 0;
  const devCount = countOf(DISPO_DEV_PIPELINE);
  const agentCount = countOf(DISPO_AGENT_PIPELINE);

  // ── Deals tab: follow-up Kanban across the dispo DEAL pipelines ──
  const pipelines = await readPipelines();
  const dealNames = pipelines.map((p) => p.name).filter((n) => isDispoDealPipeline(n));
  const dealOpps = tab === "deals" && dealNames.length
    ? await db.crmOpportunity.findMany({ where: { archivedAt: null, pipeline: { in: dealNames } }, select: { id: true, title: true, formData: true, contact: { select: { name: true, address: true } } } })
    : [];
  const followCards: FollowupCard[] = [];
  for (const o of dealOpps) {
    const dealAddr = formatAddress(o.contact?.address || "") || o.title || o.contact?.name || "deal";
    for (const b of readDispoBuyers(o.formData)) followCards.push({ oppId: o.id, entryId: b.id, name: b.name, kind: b.kind, phone: b.phone, email: b.email, price: b.price, stage: b.stage, nextFollowUp: b.nextFollowUp, lastContact: b.lastContact, dealAddr });
  }
  const dueToday = followCards.filter((c) => c.nextFollowUp && c.nextFollowUp <= today && c.stage !== "passed" && c.stage !== "offer_in").length;

  // ── Network tab (developers / agents): same cards + Kanban as the Seller CRM ──
  let netColumns: CrmColumn[] = [];
  let netCards: CrmCard[] = [];
  let netCounts: Record<string, number> = {};
  let networkPipeline = "";
  if (tab === "developers" || tab === "agents") {
    networkPipeline = tab === "developers" ? DISPO_DEV_PIPELINE : DISPO_AGENT_PIPELINE;
    const stages = DISPO_NETWORK_PIPELINES.find((p) => p.name === networkPipeline)?.stages ?? [];
    netColumns = stages.map((s, i) => ({ key: s.key, label: s.label, cls: PALETTE[i % PALETTE.length] }));
    const opps = await db.crmOpportunity.findMany({
      where: { archivedAt: null, pipeline: networkPipeline },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, stage: true, assignedTo: true, tags: true, updatedAt: true, createdAt: true, formData: true, contact: { select: { name: true, phone: true, email: true, address: true, pinnedNote: true } } },
    });
    const needle = q.toLowerCase();
    netCards = opps.map((o) => {
      const imp = ((o.formData ?? {}) as { __import?: { market?: string; buyBox?: string } }).__import ?? {};
      const area = imp.market || "";
      const buyBox = imp.buyBox || o.contact?.pinnedNote || "";
      return {
        id: o.id, title: buyBox, contactName: o.contact?.name || o.title, contactId: undefined,
        address: area, phone: o.contact?.phone || undefined, email: o.contact?.email || undefined,
        stage: o.stage || "new", assignedTo: o.assignedTo || "", tags: parseTags(o.tags), badges: [],
        money: "", valueNum: 0, updatedAt: o.updatedAt.toISOString(), createdAt: o.createdAt.toISOString(),
      } as CrmCard;
    }).filter((c) => !needle || `${c.contactName} ${c.address ?? ""} ${c.title ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(needle));
    for (const c of netCards) netCounts[c.stage] = (netCounts[c.stage] ?? 0) + 1;
  }

  const TABS: { key: Tab; label: string; n: number }[] = [
    { key: "deals", label: "📇 Deals & follow-ups", n: followCards.length },
    { key: "developers", label: "🏗 Developers", n: devCount },
    { key: "agents", label: "🧑‍💼 Buyer agents", n: agentCount },
  ];
  const qs = (over: Record<string, string>) => { const p = new URLSearchParams({ tab, ...(q ? { q } : {}), ...(listView ? { view: "list" } : {}), ...over }); for (const [k, v] of [...p.entries()]) if (!v) p.delete(k); return `/dispo?${p.toString()}`; };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="🎯 Dispositions CRM"
        subtitle="Dispo's buyer side — same board the team uses on the Seller CRM. Developers + buyer agents are their own pipelines (not mixed with sellers); the Deals tab tracks buyer follow-ups per deal."
        accent="bg-emerald-500"
        right={<Link href="/crm?pl=DS%3A%20Sell%20Land%20Then%20Sign" className="rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-navy-700">→ Deal pipelines</Link>}
      />

      {sp.imp && /^\d+$/.test(sp.imp) && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Imported {sp.imp} lead{sp.imp === "1" ? "" : "s"}{sp.dev && sp.agent ? ` (${sp.dev} developers, ${sp.agent} buyer agents)` : ""}.{sp.dup && /^\d+$/.test(sp.dup) ? ` Skipped ${sp.dup} already here.` : ""}</div>}

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
            <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-slate-800">{followCards.length}</div><div className="text-[11px] font-semibold text-slate-500">Buyers / agents in play</div></Card>
            <Card className="p-3 text-center"><div className={`text-2xl font-extrabold tabular-nums ${dueToday ? "text-red-600" : "text-slate-800"}`}>{dueToday}</div><div className="text-[11px] font-semibold text-slate-500">Follow-ups due today</div></Card>
            <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-emerald-700">{followCards.filter((c) => c.stage === "offer_in").length}</div><div className="text-[11px] font-semibold text-slate-500">💵 Price / offer in</div></Card>
          </div>
          {followCards.length === 0 ? (
            <Card className="p-8 text-center text-slate-500">
              <div className="mb-2 text-3xl">📇</div>
              <p className="text-sm font-semibold text-slate-700">No buyers on the board yet.</p>
              <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-500">Open a deal in <b>DS: Sell Land Then Sign</b>, then on its <b>📇 Buyers &amp; agents</b> panel hit <b>🔗 Attach from buyer network</b> — attached buyers show up here to work.</p>
              <Link href="/crm?pl=DS%3A%20Sell%20Land%20Then%20Sign" className="mt-4 inline-block rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white">Open the deal pipeline</Link>
            </Card>
          ) : (
            <Card className="p-3">
              <DispoFollowupKanban cards={followCards} today={today} />
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                {DISPO_BUYER_STAGES.map((s) => <span key={s.key}><span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${s.dot}`} />{s.label}</span>)}
              </div>
            </Card>
          )}
        </>
      )}

      {(tab === "developers" || tab === "agents") && (
        <>
          <details className="rounded-2xl bg-white p-3 ring-1 ring-slate-200" open={(tab === "developers" ? devCount : agentCount) === 0}>
            <summary className="cursor-pointer text-[13px] font-bold text-slate-700">📥 Import the Excel list <span className="font-normal text-slate-400">— auto-split by Type, duplicates skipped</span></summary>
            <p className="mt-2 mb-3 text-xs text-slate-500">Upload the <b>unvetted-developers-backfill.csv</b>. Each row becomes a CRM lead with its notes; developers + buyer agents split into their tabs. Re-uploading is safe.</p>
            <CsvMapImport action={importDispoNetworkCsv} returnTo={`/dispo?tab=${tab}`} />
          </details>

          {/* search + view toggle */}
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <form action="/dispo" method="get" className="flex min-w-[240px] flex-1 items-center gap-2">
              <input type="hidden" name="tab" value={tab} />
              {listView && <input type="hidden" name="view" value="list" />}
              <input name="q" defaultValue={q} placeholder={`🔎 Search ${tab === "developers" ? "developers" : "buyer agents"} — name, area, buy-box, phone…`} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
              <button className="rounded-lg bg-brand-navy px-3 py-2 text-xs font-bold text-white">Search</button>
              {q && <Link href={qs({ q: "" })} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600">clear</Link>}
            </form>
            <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-200">
              <Link href={qs({ view: "" })} className={`px-3 py-1.5 text-xs font-bold ${!listView ? "bg-brand-navy text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📊 Board</Link>
              <Link href={qs({ view: "list" })} className={`px-3 py-1.5 text-xs font-bold ${listView ? "bg-brand-navy text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📇 List</Link>
            </div>
            <span className="text-[11px] font-semibold text-slate-400">{netCards.length} shown</span>
          </Card>

          {netCards.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-400">No {tab === "developers" ? "developers" : "buyer agents"} {q ? "match that search" : "yet — import the Excel list above"}.</Card>
          ) : listView ? (
            <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
              {netCards.map((c, i) => (
                <Link key={c.id} href={`/crm/${c.id}`} className={`flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 ${i ? "border-t border-slate-100" : ""} ${i % 2 ? "bg-white" : "bg-slate-50/40"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="truncate text-[13px] font-bold text-slate-800">{c.contactName}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{netColumns.find((s) => s.key === c.stage)?.label ?? c.stage}</span></div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">{c.phone && <span className="font-semibold text-brand-navy">{c.phone}</span>}{c.address && <span>📍 {c.address}</span>}</div>
                    {c.title && <div className="mt-0.5 truncate text-[11px] text-slate-400">{c.title}</div>}
                  </div>
                  <span className="shrink-0 text-[11px] font-bold text-sky-600">Open →</span>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="p-3">
              <CrmQuickView stages={netColumns.map((s) => ({ key: s.key, label: s.label }))} pipelineStages={{ [networkPipeline]: netColumns.map((s) => ({ key: s.key, label: s.label })) }} />
              <CrmKanban columns={netColumns} cards={netCards} counts={netCounts} currentPipeline={networkPipeline} pipelineNames={[networkPipeline]} pipelineStages={{ [networkPipeline]: netColumns.map((s) => ({ key: s.key, label: s.label })) }} listHref={`/dispo?tab=${tab}&view=list`} who="all" />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
