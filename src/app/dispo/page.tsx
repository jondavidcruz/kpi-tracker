import Link from "next/link";
import { getCurrentUser, canAccessMarketing, isManager } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { readPipelines, parseTags } from "@/lib/crm";
import { commsFor } from "@/lib/crm-comms";
import { formatAddress } from "@/lib/address";
import { Card, SectionTitle } from "@/components/ui";
import { readDispoBuyers, isDevNetworkName, isAgentNetworkName, DISPO_BUYER_STAGES, DISPO_BUYER_KINDS, DISPO_DEV_PIPELINE, DISPO_AGENT_PIPELINE, DISPO_NETWORK_PIPELINES } from "@/lib/dispo-buyers";
import { resolveNetworkPipelines } from "@/lib/dispo-network";
import DispoPipeSelect from "@/components/DispoPipeSelect";
import LiveRefresh from "@/components/LiveRefresh";
import DispoFollowupKanban, { type FollowupCard } from "@/components/DispoFollowupKanban";
import CrmKanban, { type CrmCard, type CrmColumn } from "@/components/CrmKanban";
import CrmQuickView from "@/components/CrmQuickView";
import CsvMapImport from "@/components/CsvMapImport";
import { importDispoNetworkCsv } from "@/app/actions";
import { logDispoBuyerTouchAction, bulkAttachNetworkBuyerToDealsAction, runDispoCascadeAction, resortOrphanStagesAction, syncClosedDealsAction } from "@/app/crm/actions";
import { leadTypeBadge, sellerKind } from "@/lib/lead-type";
import { stripAgentNotesBlock, parcelCount } from "@/lib/crm-shared";
import DispoScoreboard, { type RepRow, type TeamStats } from "@/components/DispoScoreboard";
import { gateForCurrentStage, gateCleared, readGateChecks, pathForPipeline, PATH_META } from "@/lib/dispo-gates";
import { parseAcres, fmtAcres, parseAcreQuery, acreInRange } from "@/lib/acreage";
import { readDispoOffers, offerStats, OFFER_GOAL } from "@/lib/dispo-offers";

export const dynamic = "force-dynamic";

type Tab = "deals" | "developers" | "agents" | "team" | "nextup";
const PALETTE = ["bg-sky-100 text-sky-800", "bg-yellow-100 text-yellow-800", "bg-violet-100 text-violet-800", "bg-amber-100 text-amber-800", "bg-emerald-100 text-emerald-800", "bg-rose-100 text-rose-600", "bg-slate-200 text-slate-600"];

// 🗺 Pull "City, ST" out of a canonical "Street, City, ST ZIP" address so we can
// group deals by market. Street is parts[0], the state/zip tail is last; the city
// is the first part after the street. Guards against street-only / junk rows.
function cityState(addr?: string): { city: string; st: string } {
  if (!addr) return { city: "", st: "" };
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return { city: "", st: "" };
  const tail = parts[parts.length - 1];
  const st = (tail.match(/\b([A-Z]{2})\b/) || [])[1] || "";
  const c = parts[1];
  const city = c && !/^\d/.test(c) && !/^[A-Z]{2}\b/.test(c) ? c : "";
  return { city, st };
}

// 🎯 Dispositions CRM — dispo's buyer side, built with the SAME Kanban the team
// already uses on the Seller CRM (Jon 2026-10-20: "make it look like what they
// recognize"). Developers + Buyer Agents are their own pipelines here (not mixed
// with sellers); the Deals tab tracks buyer follow-ups per deal.
export default async function DispoPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; view?: string; dealpl?: string; imp?: string; dev?: string; agent?: string; dup?: string; bulk?: string; acmin?: string; acmax?: string; resorted?: string; pipedx?: string; synced?: string }> }) {
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
  const tab: Tab = sp.tab === "developers" || sp.tab === "agents" || sp.tab === "team" || sp.tab === "nextup" ? sp.tab : "deals";
  const listView = sp.view === "list";
  const areasView = sp.view === "areas";
  const inventoryView = sp.view === "inventory";
  const closedView = sp.view === "closed";
  const qRaw = (sp.q ?? "").trim();
  // ⛰️ Pull an acre filter OUT of the search box ("5-10 acres", ">10 ac") so the
  // text search below only matches on what's left (name/address). Explicit acre
  // min/max inputs override/augment the query-parsed range (Jon 2026-10-22).
  const aq = parseAcreQuery(qRaw);
  const q = aq.matched ? aq.rest : qRaw;
  const acMinIn = sp.acmin && /^\d+(\.\d+)?$/.test(sp.acmin) ? Number(sp.acmin) : undefined;
  const acMaxIn = sp.acmax && /^\d+(\.\d+)?$/.test(sp.acmax) ? Number(sp.acmax) : undefined;
  const acMin = acMinIn ?? aq.min;
  const acMax = acMaxIn ?? aq.max;
  const acreFilterOn = acMin != null || acMax != null;
  const settings = await getSettings();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings.orgTimezone }).format(new Date());
  const comms = await commsFor(me!); // click-to-call / text / email on the cards, like the Seller CRM

  // (Removed the auto-create of a "DS: Signed Off Market" pipeline — Jon manages the
  // dispo pipelines himself now and it kept respawning one he'd deleted. 2026-10-24)
  const net = await resolveNetworkPipelines();
  // 🔎 manager diagnostic data (only when ?pipedx=1) — where do all opps actually live?
  const pipeDx = sp.pipedx && isManager(me)
    ? { dev: net.dev, agent: net.agent, rows: (await db.crmOpportunity.groupBy({ by: ["pipeline"], where: { archivedAt: null }, _count: { _all: true } }).catch(() => [] as { pipeline: string; _count: { _all: number } }[])).map((r) => ({ pipeline: r.pipeline, count: r._count._all })).sort((a, b) => b.count - a.count) }
    : null;
  const countRows = await db.crmOpportunity.groupBy({ by: ["pipeline"], where: { archivedAt: null, pipeline: { in: net.all } }, _count: { _all: true } }).catch(() => [] as { pipeline: string; _count: { _all: number } }[]);
  const sumCount = (names: string[]) => countRows.filter((c) => names.includes(c.pipeline)).reduce((a, c) => a + c._count._all, 0);
  const devCount = sumCount(net.dev);
  const agentCount = sumCount(net.agent);

  // ── Deals tab: the actual DEAL pipeline (DS: Sell Land Then Sign) board +
  // the buyer follow-ups attached to those deals (Jon 2026-10-20: "feed the leads
  // from DS: Sell Land Then Sign"). ──
  const pipelines = await readPipelines();
  // Deal pipelines = everything assigned to the Dispositions CRM that ISN'T the
  // developer/buyer-agent network (those have their own tabs). Uses the explicit CRM
  // assignment so pipelines Jon creates + marks "Dispositions" show up here even if
  // their name doesn't match an old keyword pattern (Jon 2026-10-24).
  const { readPipelineCrm, crmGroupOf } = await import("@/lib/pipeline-crm");
  const crmMap = await readPipelineCrm();
  const dealPipes = pipelines.filter((p) => p.name !== "War Room" && crmGroupOf(p.name, crmMap) === "dispositions" && !isDevNetworkName(p.name) && !isAgentNetworkName(p.name));
  const dealNames = dealPipes.map((p) => p.name);
  // which deal pipeline to show (default the Sell-Land one Jon named)
  const dealPl = dealPipes.find((p) => p.name === sp.dealpl)?.name
    ?? dealPipes.find((p) => /sell land/i.test(p.name))?.name
    ?? dealNames[0] ?? "";
  const dealOpps = (tab === "deals" || tab === "team" || tab === "nextup") && dealNames.length
    ? await db.crmOpportunity.findMany({ where: { archivedAt: null, pipeline: { in: dealNames } }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, pipeline: true, stage: true, assignedTo: true, tags: true, value: true, askPrice: true, updatedAt: true, createdAt: true, formData: true, contactId: true, contact: { select: { name: true, phone: true, email: true, address: true } } } })
    : [];
  // 📅 next upcoming task / appointment per deal (today or later) → green/red card chips
  const dealIds = dealOpps.filter((o) => o.pipeline === dealPl).map((o) => o.id);
  const [dealTasks, dealAppts] = tab === "deals" && dealIds.length
    ? await Promise.all([
        db.crmTask.findMany({ where: { oppId: { in: dealIds }, doneAt: null }, select: { oppId: true, due: true } }),
        db.crmAppointment.findMany({ where: { oppId: { in: dealIds }, at: { gte: new Date() } }, orderBy: { at: "asc" }, select: { oppId: true, at: true } }),
      ])
    : [[], []];
  const nextTaskByDeal = new Map<string, string>();
  for (const t of dealTasks) { const d = (t.due || "").slice(0, 10); if (d && d >= today && (!nextTaskByDeal.has(t.oppId) || d < nextTaskByDeal.get(t.oppId)!)) nextTaskByDeal.set(t.oppId, d); }
  const nextApptByDeal = new Map<string, Date>();
  for (const a of dealAppts) { if (!nextApptByDeal.has(a.oppId)) nextApptByDeal.set(a.oppId, a.at); }
  // A closed/won stage — detected by the stage KEY or LABEL so it works even for
  // deals orphaned by a rename (their old key still says won/closed). Excludes
  // "closing scheduled" (still open) and died/dead (lost).
  // Match the stage KEY (a slug like "closed_won") — no \b, since "_" is a word char
  // so \bwon\b/\bclosed\b fail on compound keys. Mirrors isWonStage in setOppStageAction.
  const isClosedStage = (s: string) => /won|closed|sold/i.test(s || "") && !/died|dead|nurtur/i.test(s || "");
  // the deal board (cards for the selected deal pipeline)
  const dealColumns: CrmColumn[] = (dealPipes.find((p) => p.name === dealPl)?.stages ?? []).map((s) => ({ key: s.key, label: s.label, cls: s.cls }));
  const dealStageKeys = new Set(dealColumns.map((s) => s.key));
  // Valid bulk MOVE targets from a dispo deal board = every non-network pipeline
  // (so Acquisitions ← Dispositions moves work; Jon 2026-10-24 couldn't move leads
  // back to acquisitions because only the current pipeline was offered).
  const movePipes = pipelines.filter((p) => !isDevNetworkName(p.name) && !isAgentNetworkName(p.name));
  const moveStages = Object.fromEntries(movePipes.map((p) => [p.name, p.stages.map((s) => ({ key: s.key, label: s.label }))]));
  // 🚑 Orphaned deals: stored stage no longer exists in this pipeline (a stage rename
  // re-keyed them) → they pile into the first column & "select whole stage" counts 0.
  const prettyStage = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const orphanOpps = dealOpps.filter((o) => o.pipeline === dealPl && o.stage && !dealStageKeys.has(o.stage));
  const orphanCount = orphanOpps.length;
  // ✅ Closed board — every CLOSED/WON deal across ALL three dispo pipelines, tagged
  // by its type (Jon 2026-10-24: "the final board that shows all deal types we closed").
  const closedDeals = (tab === "deals" ? dealOpps.filter((o) => isClosedStage(o.stage)) : []).map((o) => ({
    id: o.id,
    address: o.contact?.address ? formatAddress(o.contact.address) : (o.title || o.contact?.name || "deal"),
    contactName: o.contact?.name || "",
    pipeline: o.pipeline,
    typeEmoji: PATH_META[pathForPipeline(o.pipeline)].emoji,
    acres: parseAcres(o.formData),
    money: o.value != null ? `$${o.value.toLocaleString()}` : o.askPrice != null ? `ask $${o.askPrice.toLocaleString()}` : "",
    valueNum: o.value ?? o.askPrice ?? 0,
    stage: prettyStage(o.stage || ""),
    owner: o.assignedTo || "",
    at: o.updatedAt,
  })).sort((a, b) => b.at.getTime() - a.at.getTime());
  const closedTotal = closedDeals.reduce((a, d) => a + d.valueNum, 0);
  const dealCards: CrmCard[] = dealOpps.filter((o) => o.pipeline === dealPl).map((o) => ({
    id: o.id, title: o.title, contactName: o.contact?.name || o.title, contactId: o.contactId, address: formatAddress(o.title || "") || (o.contact?.address ? formatAddress(o.contact.address) : undefined),
    phone: o.contact?.phone ? o.contact.phone.replace(/\.\d+$/, "") : undefined, email: o.contact?.email || undefined, stage: o.stage || dealColumns[0]?.key || "new", assignedTo: o.assignedTo || "", tags: parseTags(o.tags), badges: [],
    money: o.value != null ? `$${o.value.toLocaleString()}` : o.askPrice != null ? `ask $${o.askPrice.toLocaleString()}` : "", valueNum: o.value ?? o.askPrice ?? 0,
    updatedAt: o.updatedAt.toISOString(), createdAt: o.createdAt.toISOString(),
    nextTask: nextTaskByDeal.get(o.id) ?? "", nextAppt: nextApptByDeal.get(o.id)?.toISOString() ?? "",
    leadType: leadTypeBadge(sellerKind(o.formData, o.pipeline)),
    parcels: parcelCount(o.formData, o.contact?.address, (o.formData as { property?: { apn?: string } } | null)?.property?.apn),
    acres: parseAcres(o.formData) ?? undefined,
    offers: (() => { const s = offerStats(readDispoOffers(o.formData)); return { live: s.live, goal: OFFER_GOAL }; })(),
    staleStage: o.stage && !dealStageKeys.has(o.stage) ? prettyStage(o.stage) : undefined,
    gate: (() => {
      const gt = gateForCurrentStage(pathForPipeline(o.pipeline), dealColumns.map((s) => ({ key: s.key, label: s.label })), o.stage);
      return gt ? { cleared: gateCleared(gt, readGateChecks(o.formData)), label: gt.label } : undefined;
    })(),
  }));
  // 🔎 search the deal board (name / address / phone) — parity with the Seller CRM —
  // plus an ⛰️ acre-size filter so dispo can answer "do we have 5–10 acre parcels?"
  // instantly (Jon 2026-10-22). Acre tokens are stripped from the text query above.
  const dealCardsShown = dealCards.filter((c) => {
    if (q && !`${c.contactName} ${c.address ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (acreFilterOn && !acreInRange(c.acres ?? null, acMin, acMax)) return false;
    return true;
  });
  // 🗂 Land diligence per deal (for the Inventory spreadsheet view): zoning,
  // access, flood, wetlands, utilities, features, notes — pulled from the land
  // intake (formData.land.*) so the inventory reads like a for-sale sheet.
  const landByOpp = new Map<string, { zoning: string; access: string; topo: string; flood: string; wetlands: string; utilities: string[]; features: string[]; notes: string }>();
  if (tab === "deals") {
    const asArr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)) : []);
    for (const o of dealOpps.filter((x) => x.pipeline === dealPl)) {
      const land = ((o.formData ?? {}) as { land?: Record<string, unknown> }).land ?? {};
      landByOpp.set(o.id, {
        zoning: String(land.zoning ?? ""),
        access: String(land.legalAccess ?? ""),
        topo: String(land.topography ?? ""),
        flood: String(land.floodZone ?? land.hazard ?? ""),
        wetlands: String(land.wetlands ?? ""),
        utilities: asArr(land.utilities),
        features: asArr(land.features),
        notes: String(land.special ?? ""),
      });
    }
  }
  const dealCounts: Record<string, number> = {};
  for (const c of dealCardsShown) dealCounts[c.stage] = (dealCounts[c.stage] ?? 0) + 1;
  // buyer follow-ups attached across ALL deal pipelines
  const followCards: FollowupCard[] = [];
  for (const o of dealOpps) {
    const dealAddr = formatAddress(o.contact?.address || "") || o.title || o.contact?.name || "deal";
    for (const b of readDispoBuyers(o.formData)) followCards.push({ oppId: o.id, entryId: b.id, name: b.name, kind: b.kind, phone: b.phone, email: b.email, price: b.price, stage: b.stage, nextFollowUp: b.nextFollowUp, lastContact: b.lastContact, dealAddr });
  }
  const dueToday = followCards.filter((c) => c.nextFollowUp && c.nextFollowUp <= today && c.stage !== "passed" && c.stage !== "offer_in").length;
  // ⏰ Overdue buyer follow-ups (due BEFORE today) — surfaced on the board so Sharyn
  // & Marie can't miss a buyer they promised to chase (Jon 2026-10-24).
  const overdueFollowups = followCards
    .filter((c) => c.nextFollowUp && c.nextFollowUp < today && c.stage !== "passed" && c.stage !== "offer_in")
    .sort((a, b) => (a.nextFollowUp ?? "").localeCompare(b.nextFollowUp ?? ""));

  // 🚨 "Not out yet" — deals that haven't reached the marketing stage AND have no
  // buyers attached = genuinely not pushed to anyone (Jon 2026-10-21). A deal already
  // at "Sent to Agents/On Market" HAS been sent (the stage says so) — don't flag it
  // just because its buyers aren't tracked in our new tracker yet.
  const dealsWithBuyers = new Set(followCards.map((f) => f.oppId));
  const marketIdx = dealColumns.findIndex((s) => /sent to agent|on market|marketing|\bjvp\b/i.test(s.label) || /sent to agent|on market|marketing|\bjvp\b/i.test(s.key));
  const notOutDeals = tab === "deals"
    ? dealCardsShown.filter((c) => {
        if (dealsWithBuyers.has(c.id)) return false;
        const si = dealColumns.findIndex((s) => s.key === c.stage);
        if (si < 0) return false;
        if (/nurtur|no buyer interest|\bdead\b|overpric|died/i.test(dealColumns[si].label)) return false;
        return marketIdx < 0 ? true : si < marketIdx; // only PRE-marketing stages
      })
    : [];

  // 🥶 Going cold: deals that ARE out (at/past the Sent-to-Buyers stage) but have
  // fewer than 3 live offers AND nothing's moved on them in 2+ days — the goal is
  // 3 offers, and a stalled deal with too few is dispo not pushing hard enough
  // (Jon 2026-10-24). Excludes closed/won + dead/nurture side stages.
  const COLD_DAYS = 2;
  const coldDeals = tab === "deals" && marketIdx >= 0
    ? dealCardsShown.filter((c) => {
        const si = dealColumns.findIndex((s) => s.key === c.stage);
        if (si < marketIdx) return false; // not out yet
        const lbl = `${dealColumns[si]?.key ?? ""} ${dealColumns[si]?.label ?? ""}`;
        if (/won|closed|sold|nurtur|\bdead\b|died|lost/i.test(lbl)) return false; // closed or parked
        if ((c.offers?.live ?? 0) >= OFFER_GOAL) return false; // hit the goal
        const ageDays = c.updatedAt ? (Date.now() - new Date(c.updatedAt).getTime()) / 86400000 : 0;
        return ageDays >= COLD_DAYS;
      }).map((c) => ({ ...c, ageDays: c.updatedAt ? Math.floor((Date.now() - new Date(c.updatedAt).getTime()) / 86400000) : 0 }))
      .sort((a, b) => (a.offers?.live ?? 0) - (b.offers?.live ?? 0) || b.ageDays - a.ageDays)
    : [];

  // 📊 Accountability scoreboard (Jon 2026-10-21) — today's outreach on dispo deals,
  // per rep + team throughput. Honest, from the activity log — no self-reporting.
  let scoreReps: RepRow[] = [];
  let scoreTeam: TeamStats = { dealsPushed: 0, totalActive: 0, agentsReached: 0, thisHour: 0 };
  let scoreAlert: string | null = null;
  if (tab === "deals" || tab === "team" || tab === "nextup") {
    const tz = settings.orgTimezone;
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date());
    const gv = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
    const todayStart = new Date(Date.now() - ((gv("hour") % 24) * 3600 + gv("minute") * 60 + gv("second")) * 1000);
    const hourStart = new Date(Date.now() - (gv("minute") * 60 + gv("second")) * 1000);
    const allDealIds = dealOpps.map((o) => o.id);
    const evs = allDealIds.length
      ? await db.crmEvent.findMany({ where: { oppId: { in: allDealIds }, at: { gte: todayStart }, kind: { in: ["call", "sms", "email"] } }, select: { actor: true, oppId: true, at: true, body: true } })
      : [];
    const { secondaryPositionOf } = await import("@/lib/roles");
    const users = await db.user.findMany({ where: { active: true }, select: { name: true, position: true } }).catch(() => [] as { name: string; position: string | null }[]);
    const dispoUsers = users.filter((u) => u.position === "dispositions" || secondaryPositionOf({ name: u.name, position: u.position ?? undefined }) === "dispositions");
    const byRep = new Map<string, { deals: Set<string>; outreach: number; agents: number; last: number | null }>();
    const agentNames = new Set<string>();
    let thisHourCount = 0;
    for (const e of evs) {
      const a = e.actor || "";
      if (a && a !== "auto") {
        const r = byRep.get(a) ?? { deals: new Set<string>(), outreach: 0, agents: 0, last: null };
        r.deals.add(e.oppId); r.outreach++;
        if (/deal buyer tracker|🔗 attached/i.test(e.body)) r.agents++;
        const t = e.at.getTime(); if (r.last == null || t > r.last) r.last = t;
        byRep.set(a, r);
      }
      const m = /followed up with ([^(]+)\(deal buyer tracker\)/i.exec(e.body);
      if (m) agentNames.add(m[1].trim().toLowerCase());
      if (e.at.getTime() >= hourStart.getTime()) thisHourCount++;
    }
    const elapsedH = Math.max(0.5, (gv("hour") - 8) + gv("minute") / 60); // hours into an 8am shift
    scoreReps = dispoUsers.map((u) => { const r = byRep.get(u.name); const out = r ? r.outreach : 0; return { name: u.name, dealsWorked: r ? r.deals.size : 0, outreach: out, agentsWorked: r ? r.agents : 0, lastAgoMin: r && r.last ? Math.round((Date.now() - r.last) / 60000) : null, perHour: Math.round((out / elapsedH) * 10) / 10 }; })
      .sort((a, b) => b.outreach - a.outreach);
    scoreTeam = { dealsPushed: new Set(evs.map((e) => e.oppId)).size, totalActive: dealOpps.length, agentsReached: agentNames.size, thisHour: thisHourCount };
    // ⏰ Shift-hours stall nudge — dispo should push a deal out every hour (Jon 2026-10-21).
    const ptHour = gv("hour");
    const dow = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date());
    const shiftActive = ptHour >= 8 && ptHour < 18 && dow !== "Sun";
    const lasts = scoreReps.map((r) => r.lastAgoMin).filter((x): x is number => x != null);
    const teamLast = lasts.length ? Math.min(...lasts) : null;
    if (shiftActive) {
      if (teamLast == null) scoreAlert = "🚨 Dispo is cold — nothing has gone out today. Open a deal, run the cascade, and start calling buyers.";
      else if (teamLast > 45) scoreAlert = `💤 No dispo outreach in ${teamLast} min. Get the next deal out — pick one from Next Up and work the buyers.`;
      else if (scoreTeam.thisHour === 0) scoreAlert = "⏰ No deals out this hour yet. The goal is more buyers reached every hour — run a cascade now.";
    }
  }

  // 🗺 Areas view — group THIS pipeline's deals by city so an agent/developer buying
  // across many parcels + sellers in one market is visible together and attachable in
  // one move (Jon 2026-10-21). Read-only grouping; no schema change.
  type AreaGroup = { key: string; label: string; cards: CrmCard[]; dealIds: string[]; attached: { name: string; kind: string; count: number }[] };
  let areaGroups: AreaGroup[] = [];
  let buyerOptions: { id: string; label: string; group: string }[] = [];
  if (tab === "deals" && areasView) {
    const map = new Map<string, CrmCard[]>();
    for (const c of dealCardsShown) {
      const { city, st } = cityState(c.address);
      const key = city ? `${city}|${st}` : "__none";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    const dealIdSet = new Set(dealCardsShown.map((c) => c.id));
    const byDeal = new Map<string, FollowupCard[]>();
    for (const f of followCards) { if (!dealIdSet.has(f.oppId)) continue; if (!byDeal.has(f.oppId)) byDeal.set(f.oppId, []); byDeal.get(f.oppId)!.push(f); }
    areaGroups = [...map.entries()].map(([key, cards]) => {
      const dealIds = cards.map((c) => c.id);
      const counts = new Map<string, { name: string; kind: string; count: number }>();
      for (const id of dealIds) for (const f of byDeal.get(id) ?? []) {
        const k = `${f.name.toLowerCase()}|${f.kind}`;
        const e = counts.get(k) ?? { name: f.name, kind: f.kind, count: 0 };
        e.count++; counts.set(k, e);
      }
      return { key, label: key === "__none" ? "📍 No city on file" : key.replace("|", ", "), cards, dealIds, attached: [...counts.values()].sort((a, b) => b.count - a.count) };
    }).sort((a, b) => (a.key === "__none" ? 1 : 0) - (b.key === "__none" ? 1 : 0) || b.cards.length - a.cards.length);
    const opts = await db.crmOpportunity.findMany({ where: { archivedAt: null, pipeline: { in: net.all } }, select: { id: true, pipeline: true, contact: { select: { name: true } } }, orderBy: { updatedAt: "desc" } });
    buyerOptions = opts.map((o) => ({ id: o.id, label: o.contact?.name || "(unnamed)", group: isAgentNetworkName(o.pipeline) ? "🧑‍💼 Buyer agents" : "🏗 Developers" }));
  }

  // ⏭ Next Up — one prioritized list of who to follow up with next (Jon 2026-10-21,
  // like acquisitions' Next Up). Overdue first (most overdue on top), then due today,
  // then upcoming. Follow-ups are outreach → Sharyn's job, but both can work it.
  const nextUp = tab === "nextup"
    ? followCards
        .filter((c) => c.nextFollowUp && c.stage !== "passed" && c.stage !== "offer_in")
        .map((c) => {
          const overdueDays = c.nextFollowUp! < today ? Math.round((Date.parse(today) - Date.parse(c.nextFollowUp!)) / 86400000) : 0;
          return { ...c, overdueDays, dueNow: c.nextFollowUp! <= today };
        })
        .sort((a, b) => (Number(b.dueNow) - Number(a.dueNow)) || (b.overdueDays - a.overdueDays) || (a.nextFollowUp! < b.nextFollowUp! ? -1 : 1))
        .slice(0, 80)
    : [];

  // ── Team tab: Sharyn (outreach/phones) vs Marie (data/organization) work lanes,
  // so they stay on the same page with clear ownership (Jon 2026-10-20). ──
  type LaneItem = { oppId: string; label: string; detail: string; urgent?: boolean };
  const sharynQueue: LaneItem[] = [];
  const marieQueue: LaneItem[] = [];
  if (tab === "team") {
    const { MARKETING_STEPS, readMarketingDone } = await import("@/lib/dispo-marketing");
    // Sharyn — phone/outreach: every overdue/ due follow-up is a call to make
    for (const c of followCards) {
      if (c.nextFollowUp && c.nextFollowUp <= today && c.stage !== "passed" && c.stage !== "offer_in") {
        const over = c.nextFollowUp < today;
        sharynQueue.push({ oppId: c.oppId, label: `📞 Follow up: ${c.name}`, detail: `${c.dealAddr}${c.phone ? ` · ${c.phone}` : ""} — ${over ? `overdue ${c.nextFollowUp}` : "due today"}`, urgent: over });
      }
    }
    for (const o of dealOpps) {
      const addr = formatAddress(o.contact?.address || "") || o.title || "deal";
      const buyers = readDispoBuyers(o.formData);
      // Sharyn — deals sent out with no attached buyers yet = needs outreach
      if (buyers.length === 0) sharynQueue.push({ oppId: o.id, label: `📣 Line up buyers: ${addr}`, detail: "No developers/agents attached yet — run Smart Match + call around" });
      // Marie — data gaps: missing land intake fields
      const land = ((o.formData ?? {}) as { land?: Record<string, string> }).land ?? {};
      const missing = ["acreage", "legalAccess"].filter((k) => !land[k]);
      if (missing.length) marieQueue.push({ oppId: o.id, label: `🗂 Fill intake: ${addr}`, detail: `Missing ${missing.map((m) => (m === "legalAccess" ? "road/legal access" : "acreage")).join(" + ")} — needed to match buyers`, urgent: true });
      // Marie — marketing checklist incomplete
      // Marketing split by owner: Sharyn's outreach steps → her lane, Marie's posting → hers.
      const done = new Set(readMarketingDone(o.formData));
      const sharynSteps = MARKETING_STEPS.filter((s) => s.owner === "sharyn");
      const marieSteps = MARKETING_STEPS.filter((s) => s.owner === "marie");
      const sharynLeft = sharynSteps.filter((s) => !done.has(s.key)).length;
      const marieLeft = marieSteps.filter((s) => !done.has(s.key)).length;
      if (sharynLeft) sharynQueue.push({ oppId: o.id, label: `📣 Outreach: ${addr}`, detail: `${sharynLeft} outreach step${sharynLeft > 1 ? "s" : ""} left (calls/email/text/cascade)` });
      if (marieLeft) marieQueue.push({ oppId: o.id, label: `📰 Post it: ${addr}`, detail: `${marieLeft} listing${marieLeft > 1 ? "s" : ""} left (FB groups, Lands of America, Marketplace…)` });
    }
  }

  // ── Network tab (developers / agents): same cards + Kanban as the Seller CRM ──
  let netColumns: CrmColumn[] = [];
  let netCards: CrmCard[] = [];
  let netCounts: Record<string, number> = {};
  let networkPipeline = "";
  if (tab === "developers" || tab === "agents") {
    const tabNames = tab === "developers" ? net.dev : net.agent;         // real stored name(s)
    networkPipeline = tabNames[0] ?? (tab === "developers" ? DISPO_DEV_PIPELINE : DISPO_AGENT_PIPELINE);
    const stages = (DISPO_NETWORK_PIPELINES.find((p) => tab === "developers" ? isDevNetworkName(p.name) : isAgentNetworkName(p.name))?.stages) ?? [];
    netColumns = stages.map((s, i) => ({ key: s.key, label: s.label, cls: PALETTE[i % PALETTE.length] }));
    const opps = await db.crmOpportunity.findMany({
      where: { archivedAt: null, pipeline: { in: tabNames } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, stage: true, assignedTo: true, tags: true, updatedAt: true, createdAt: true, formData: true, contactId: true, contact: { select: { name: true, phone: true, email: true, address: true, pinnedNote: true } } },
    });
    const needle = q.toLowerCase();
    netCards = opps.map((o) => {
      const imp = ((o.formData ?? {}) as { __import?: { market?: string; buyBox?: string } }).__import ?? {};
      const area = imp.market || "";
      const buyBox = imp.buyBox || stripAgentNotesBlock(o.contact?.pinnedNote) || "";
      return {
        id: o.id, title: buyBox, contactName: o.contact?.name || o.title, contactId: o.contactId,
        address: area, phone: o.contact?.phone || undefined, email: o.contact?.email || undefined,
        stage: o.stage || "new", assignedTo: o.assignedTo || "", tags: parseTags(o.tags), badges: [],
        money: "", valueNum: 0, updatedAt: o.updatedAt.toISOString(), createdAt: o.createdAt.toISOString(),
        leadType: leadTypeBadge(tab === "developers" ? "developer" : "buyer_agent"),
      } as CrmCard;
    }).filter((c) => !needle || `${c.contactName} ${c.address ?? ""} ${c.title ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(needle));
    for (const c of netCards) netCounts[c.stage] = (netCounts[c.stage] ?? 0) + 1;
  }

  const TABS: { key: Tab; label: string; n: number }[] = [
    { key: "nextup", label: "⏭ Next Up", n: dueToday },
    { key: "deals", label: "📇 Deals & follow-ups", n: followCards.length },
    { key: "developers", label: "🏗 Developers", n: devCount },
    { key: "agents", label: "🧑‍💼 Buyer agents", n: agentCount },
    { key: "team", label: "👥 Team (Sharyn & Marie)", n: sharynQueue.length + marieQueue.length },
  ];
  const qs = (over: Record<string, string>) => { const p = new URLSearchParams({ tab, ...(q ? { q } : {}), ...(listView ? { view: "list" } : {}), ...over }); for (const [k, v] of [...p.entries()]) if (!v) p.delete(k); return `/dispo?${p.toString()}`; };

  return (
    <div className="space-y-5">
      <LiveRefresh seconds={20} />
      <SectionTitle
        title="🎯 Dispositions CRM"
        subtitle="Dispo's buyer side — same board the team uses on the Seller CRM. Developers + buyer agents are their own pipelines (not mixed with sellers); the Deals tab tracks buyer follow-ups per deal."
        accent="bg-emerald-500"
        right={<Link href="/crm?pl=DS%3A%20Sell%20Land%20Then%20Sign" className="rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-navy-700">→ Deal pipelines</Link>}
      />

      {sp.imp && /^\d+$/.test(sp.imp) && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Imported {sp.imp} lead{sp.imp === "1" ? "" : "s"}{sp.dev && sp.agent ? ` (${sp.dev} developers, ${sp.agent} buyer agents)` : ""}.{sp.dup && /^\d+$/.test(sp.dup) ? ` Skipped ${sp.dup} already here.` : ""}</div>}

      {/* 🔎 manager-only pipeline diagnostic (?pipedx=1): every pipeline → live opp count,
          so we can see exactly where the developers / buyer agents actually live. */}
      {pipeDx && (
        <Card className="p-3">
          <div className="mb-1 text-[12px] font-extrabold text-slate-800">🔎 Pipeline distribution (live opps) — resolved network dev={JSON.stringify(pipeDx.dev)} · agent={JSON.stringify(pipeDx.agent)}</div>
          <div className="overflow-x-auto"><table className="text-[11px]"><tbody>
            {pipeDx.rows.map((r) => (
              <tr key={r.pipeline}><td className="pr-4 font-mono">{JSON.stringify(r.pipeline)}</td><td className="font-bold">{r.count}</td></tr>
            ))}
          </tbody></table></div>
        </Card>
      )}

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link key={t.key} href={`/dispo?tab=${t.key}`} prefetch={false}
            className={`rounded-full px-3 py-1.5 text-sm font-bold ring-1 ${tab === t.key ? "bg-brand-navy text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>
            {t.label} <span className={`ml-1 rounded-full px-1.5 text-[11px] ${tab === t.key ? "bg-white/20" : "bg-slate-100"}`}>{t.n}</span>
          </Link>
        ))}
      </div>

      {scoreAlert && (
        <Link href="/dispo?tab=nextup" className="block rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-800 ring-1 ring-red-200 transition hover:bg-red-100">{scoreAlert}</Link>
      )}
      {(tab === "deals" || tab === "team" || tab === "nextup") && <DispoScoreboard reps={scoreReps} team={scoreTeam} />}

      {tab === "nextup" && (
        <>
          <Card className="border-l-4 border-emerald-400 p-4">
            <div className="text-sm font-extrabold text-slate-800">⏭ Next Up — work this top to bottom</div>
            <p className="mt-0.5 text-[12px] text-slate-500">Every follow-up ranked by urgency (most overdue first). These are outreach calls — Sharyn&apos;s lane — but either of you can clear them. Hit 📞 Touch when you reach out and it auto-sets the next follow-up.</p>
          </Card>
          {nextUp.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-400">✅ Nothing due — no follow-ups overdue or coming up. Attach buyers to deals to start new ones.</Card>
          ) : (
            <Card className="p-2">
              <div className="space-y-1.5">
                {nextUp.map((c, i) => {
                  const km = DISPO_BUYER_KINDS.find((k) => k.key === c.kind);
                  return (
                    <div key={`${c.oppId}-${c.entryId}`} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ring-1 ${c.overdueDays > 0 ? "bg-red-50 ring-red-200" : c.dueNow ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-100"}`}>
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-navy text-[11px] font-extrabold text-white">{i + 1}</span>
                      <span className="shrink-0 text-[13px]" title={km?.label}>{km?.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/crm/${c.oppId}`} className="block truncate text-[13px] font-bold text-slate-800 hover:underline">{c.name} <span className="font-normal text-slate-400">· 📦 {c.dealAddr}</span></Link>
                        <div className="truncate text-[11px] text-slate-500">{c.phone ? `${c.phone} · ` : ""}{c.overdueDays > 0 ? `⏰ overdue ${c.overdueDays}d` : c.dueNow ? "due today" : `next ${c.nextFollowUp}`}{c.price ? ` · 💵 ${c.price}` : ""}</div>
                      </div>
                      <form action={logDispoBuyerTouchAction} className="shrink-0">
                        <input type="hidden" name="oppId" value={c.oppId} /><input type="hidden" name="entryId" value={c.entryId} />
                        <button className="rounded bg-sky-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-sky-700">📞 Touch</button>
                      </form>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}

      {tab === "deals" && (
        <>
          {/* deal-pipeline switch — a click-to-open dropdown like the Seller CRM */}
          {dealPipes.length >= 1 && (
            <DispoPipeSelect
              pipes={dealPipes.map((p) => ({ name: p.name, emoji: PATH_META[pathForPipeline(p.name)].emoji, label: PATH_META[pathForPipeline(p.name)].label, count: dealOpps.filter((o) => o.pipeline === p.name).length }))}
              current={dealPl} q={qRaw}
            />
          )}

          {dealNames.length === 0 ? (
            <Card className="p-8 text-center text-slate-400">No dispo deal pipeline found. Create <b>DS: Sell Land Then Sign</b> in the CRM first.</Card>
          ) : (
            <>
              {sp.bulk && /^\d+$/.test(sp.bulk) && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">🔗 Attached to {sp.bulk} deal{sp.bulk === "1" ? "" : "s"} in this area. They now show in each deal&apos;s buyer tracker + 📞 Next Up.</div>}
              {(() => {
                // keep the current view + acre filter on the text-search submit, and
                // the current search + acre filter on the view toggles (Jon 2026-10-22)
                const viewSuffix = areasView ? "&view=areas" : inventoryView ? "&view=inventory" : closedView ? "&view=closed" : "";
                const plSuffix = dealPl ? `&dealpl=${encodeURIComponent(dealPl)}` : "";
                const acSuffix = `${acMinIn != null ? `&acmin=${acMinIn}` : ""}${acMaxIn != null ? `&acmax=${acMaxIn}` : ""}`;
                const qSuffix = qRaw ? `&q=${encodeURIComponent(qRaw)}` : "";
                return (
              <Card className="flex flex-wrap items-center gap-2 p-3">
                <form action="/dispo" method="get" className="flex min-w-[240px] flex-1 flex-wrap items-center gap-2">
                  <input type="hidden" name="tab" value="deals" />
                  {dealPl && <input type="hidden" name="dealpl" value={dealPl} />}
                  {areasView && <input type="hidden" name="view" value="areas" />}
                  {inventoryView && <input type="hidden" name="view" value="inventory" />}
                  {closedView && <input type="hidden" name="view" value="closed" />}
                  <input name="q" defaultValue={qRaw} placeholder="🔎 Search deals — name, address, or “5-10 acres”…" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  <span className="flex items-center gap-1 rounded-xl bg-lime-50 px-2 py-1 ring-1 ring-lime-200" title="Filter by parcel size (acres)">
                    <span className="text-[11px] font-bold text-lime-700">⛰️</span>
                    <input name="acmin" defaultValue={acMinIn ?? ""} inputMode="decimal" placeholder="min" className="w-12 rounded-md border border-lime-200 bg-white px-1.5 py-1 text-xs" />
                    <span className="text-[11px] text-lime-700">–</span>
                    <input name="acmax" defaultValue={acMaxIn ?? ""} inputMode="decimal" placeholder="max" className="w-12 rounded-md border border-lime-200 bg-white px-1.5 py-1 text-xs" />
                    <span className="text-[10px] font-semibold text-lime-700">ac</span>
                  </span>
                  <button className="rounded-lg bg-brand-navy px-3 py-2 text-xs font-bold text-white">Search</button>
                  {(qRaw || acreFilterOn) && <Link href={`/dispo?tab=deals${viewSuffix}${plSuffix}`} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600">clear</Link>}
                </form>
                <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-200">
                  <Link href={`/dispo?tab=deals${plSuffix}${qSuffix}${acSuffix}`} className={`px-3 py-1.5 text-xs font-bold ${!areasView && !inventoryView && !closedView ? "bg-brand-navy text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📊 Board</Link>
                  <Link href={`/dispo?tab=deals&view=inventory${plSuffix}${qSuffix}${acSuffix}`} className={`px-3 py-1.5 text-xs font-bold ${inventoryView ? "bg-brand-navy text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📋 Inventory</Link>
                  <Link href={`/dispo?tab=deals&view=areas${plSuffix}${qSuffix}${acSuffix}`} className={`px-3 py-1.5 text-xs font-bold ${areasView ? "bg-brand-navy text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>🗺 Areas</Link>
                  <Link href={`/dispo?tab=deals&view=closed${qSuffix}`} className={`px-3 py-1.5 text-xs font-bold ${closedView ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>✅ Closed</Link>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">{dealCardsShown.length} of {dealCards.length}{acreFilterOn ? ` · ${acMin ?? "0"}–${acMax ?? "∞"} ac` : ""}</span>
              </Card>
                );
              })()}

              {/* 🔔 flash after a re-sort */}
              {sp.resorted && /^\d+$/.test(sp.resorted) && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✅ Re-sorted {sp.resorted} deal{sp.resorted === "1" ? "" : "s"} back to their matching stages.</div>}

              {/* 🚑 Orphaned-deals banner: a stage rename re-keyed deals so they piled
                  into the first column & bulk-select counts 0. One click re-files them. */}
              {orphanCount > 0 && !closedView && (
                <Card className="flex flex-wrap items-center gap-3 border-l-4 border-orange-400 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-extrabold text-orange-800">⚠️ {orphanCount} deal{orphanCount === 1 ? "" : "s"} in <b>{dealPl}</b> have an old stage from a rename</div>
                    <p className="mt-0.5 text-[12px] text-slate-500">Renaming this pipeline&apos;s stages changed their internal keys, so these deals (including ones that were <b>Won/Closed</b>) fell into the first column and can&apos;t be bulk-selected. Re-sort files each one back to its matching stage (a deal that was &ldquo;Closed/Won&rdquo; goes to your Closed/Won stage, etc.).</p>
                  </div>
                  <form action={resortOrphanStagesAction}>
                    <input type="hidden" name="pipeline" value={dealPl} />
                    <input type="hidden" name="back" value={`/dispo?tab=deals&dealpl=${encodeURIComponent(dealPl)}`} />
                    <button className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-bold text-white hover:bg-orange-700">🔧 Re-sort {orphanCount} deal{orphanCount === 1 ? "" : "s"}</button>
                  </form>
                </Card>
              )}

              {closedView ? (
                /* ✅ Closed board — every CLOSED/WON deal across all three dispo
                   pipelines, tagged by type (Jon 2026-10-24). The "final board". */
                <Card className="p-0 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-emerald-50/60 px-3 py-2">
                    <div className="text-[13px] font-extrabold text-slate-800">✅ Closed / Won — all dispo types <span className="font-semibold text-slate-400">— {closedDeals.length} deal{closedDeals.length === 1 ? "" : "s"}</span></div>
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] font-bold text-emerald-700">{closedTotal > 0 ? `$${closedTotal.toLocaleString()} total value` : ""}</div>
                      <form action={syncClosedDealsAction}>
                        <input type="hidden" name="back" value="/dispo?tab=deals&view=closed" />
                        <button className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700" title="Make sure every Closed/Won lead here also shows as a closed deal on the Deals board">🔗 Sync to Deals board</button>
                      </form>
                    </div>
                  </div>
                  {sp.synced && /^\d+$/.test(sp.synced) && <div className="border-b border-emerald-100 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-800">✅ Synced {sp.synced} closed deal{sp.synced === "1" ? "" : "s"} to the Deals board.{sp.synced === "0" ? " (All were already on the board.)" : ""}</div>}
                  {closedDeals.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-400">No closed/won deals yet. When a deal reaches a Closed/Won stage in any dispo pipeline, it shows here.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-left text-[12px]">
                        <thead className="bg-slate-50 text-[9.5px] uppercase tracking-wide text-slate-400">
                          <tr>
                            <th className="px-3 py-2 font-bold">Deal</th>
                            <th className="px-2 py-2 font-bold">Type</th>
                            <th className="px-2 py-2 font-bold">⛰️ Acres</th>
                            <th className="px-2 py-2 font-bold">Value</th>
                            <th className="px-2 py-2 font-bold">Closed stage</th>
                            <th className="px-2 py-2 font-bold">Owner</th>
                            <th className="px-2 py-2 font-bold">Date</th>
                            <th className="px-2 py-2 font-bold"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {closedDeals.map((d, i) => (
                            <tr key={d.id} className={i % 2 ? "bg-white" : "bg-slate-50/40"}>
                              <td className="px-3 py-2"><div className="font-bold text-slate-800">{d.address}</div>{d.contactName && <div className="text-[10px] text-slate-400">{d.contactName}</div>}</td>
                              <td className="px-2 py-2 text-slate-600">{d.pipeline.replace(/^[^A-Za-z]*DS:\s*/, "")}</td>
                              <td className="px-2 py-2 font-semibold text-lime-700">{d.acres != null ? fmtAcres(d.acres) : <span className="font-normal text-slate-300">—</span>}</td>
                              <td className="px-2 py-2 font-semibold text-slate-700">{d.money || <span className="font-normal text-slate-300">—</span>}</td>
                              <td className="px-2 py-2"><span className="whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{d.stage}</span></td>
                              <td className="px-2 py-2 text-slate-500">{d.owner || "—"}</td>
                              <td className="px-2 py-2 text-slate-400">{d.at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                              <td className="px-2 py-2 text-right"><Link href={`/crm/${d.id}`} className="font-bold text-sky-600 hover:underline">Open →</Link></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              ) : inventoryView ? (
                /* 📋 Inventory — treat the board like a searchable stock list: every
                   parcel in this pipeline, sorted by acreage, so when an agent says
                   "my buyer wants 5–10 acre lots" dispo filters ⛰️ and sees exactly
                   what's available to sell (Jon 2026-10-22). */
                <Card className="p-0 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-lime-50/60 px-3 py-2">
                    <div className="text-[13px] font-extrabold text-slate-800">📋 {dealPl} inventory <span className="font-semibold text-slate-400">— {dealCardsShown.length} parcel{dealCardsShown.length === 1 ? "" : "s"}{acreFilterOn ? `, ${acMin ?? "0"}–${acMax ?? "∞"} ac` : ""}</span></div>
                    <div className="text-[11px] text-slate-500">Sorted by size · sum {dealCardsShown.reduce((a, c) => a + (c.acres ?? 0), 0).toFixed(1)} ac</div>
                  </div>
                  {dealCardsShown.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-400">No parcels match{acreFilterOn ? " that acre range" : ""}{q ? " / that search" : ""}.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1100px] text-left text-[12px]">
                        <thead className="bg-slate-50 text-[9.5px] uppercase tracking-wide text-slate-400">
                          <tr>
                            <th className="px-3 py-2 font-bold">Parcel / address</th>
                            <th className="px-2 py-2 font-bold">⛰️ Acres</th>
                            <th className="px-2 py-2 font-bold">Zoning</th>
                            <th className="px-2 py-2 font-bold">Access</th>
                            <th className="px-2 py-2 font-bold">Flood</th>
                            <th className="px-2 py-2 font-bold">Wetlands</th>
                            <th className="px-2 py-2 font-bold">Utilities</th>
                            <th className="px-2 py-2 font-bold">Features</th>
                            <th className="px-2 py-2 font-bold">Ask</th>
                            <th className="px-2 py-2 font-bold">💰</th>
                            <th className="px-2 py-2 font-bold">Stage</th>
                            <th className="px-2 py-2 font-bold">Notes</th>
                            <th className="px-2 py-2 font-bold"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...dealCardsShown].sort((a, b) => (a.acres ?? Infinity) - (b.acres ?? Infinity)).map((c, i) => {
                            const ld = landByOpp.get(c.id);
                            const utils = ld?.utilities.filter((u) => !/^no /i.test(u)) ?? [];
                            const dash = <span className="text-slate-300">—</span>;
                            return (
                            <tr key={c.id} className={`align-top ${i % 2 ? "bg-white" : "bg-slate-50/40"}`}>
                              <td className="px-3 py-2">
                                <div className="font-bold text-slate-800">{c.address || c.title || c.contactName}</div>
                                <div className="text-[10px] text-slate-400">{c.contactName}{c.parcels && c.parcels > 1 ? ` · 📦 ${c.parcels}` : ""}</div>
                              </td>
                              <td className="px-2 py-2 font-extrabold text-lime-700">{c.acres != null ? fmtAcres(c.acres) : dash}</td>
                              <td className="px-2 py-2 text-slate-600">{ld?.zoning || dash}</td>
                              <td className="px-2 py-2 text-slate-600">{ld?.access ? ld.access.replace(/^⚠️ /, "⚠️") : dash}</td>
                              <td className="px-2 py-2">{ld?.flood ? <span className={`rounded px-1 py-0.5 text-[10px] font-semibold ${/^(no|zone x|none)/i.test(ld.flood) ? "bg-emerald-50 text-emerald-700" : /unknown/i.test(ld.flood) ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}`}>{ld.flood}</span> : dash}</td>
                              <td className="px-2 py-2">{ld?.wetlands ? <span className={`rounded px-1 py-0.5 text-[10px] font-semibold ${/^none/i.test(ld.wetlands) ? "bg-emerald-50 text-emerald-700" : /unknown/i.test(ld.wetlands) ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}`}>{ld.wetlands}</span> : dash}</td>
                              <td className="px-2 py-2 text-[10px] text-slate-500">{utils.length ? utils.slice(0, 3).join(", ") + (utils.length > 3 ? ` +${utils.length - 3}` : "") : dash}</td>
                              <td className="px-2 py-2 text-[10px] text-slate-500">{ld?.features.length ? ld.features.slice(0, 3).join(", ") + (ld.features.length > 3 ? ` +${ld.features.length - 3}` : "") : dash}</td>
                              <td className="px-2 py-2 font-semibold text-slate-700">{c.money || dash}</td>
                              <td className="px-2 py-2">{c.offers && c.offers.live > 0 ? <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${c.offers.live >= c.offers.goal ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{c.offers.live}/{c.offers.goal}</span> : dash}</td>
                              <td className="px-2 py-2"><span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{dealColumns.find((s) => s.key === c.stage)?.label ?? c.stage}</span></td>
                              <td className="px-2 py-2 max-w-[180px] text-[10px] text-slate-500"><span className="line-clamp-2">{ld?.notes || dash}</span></td>
                              <td className="px-2 py-2 text-right"><Link href={`/crm/${c.id}`} className="font-bold text-sky-600 hover:underline">Open →</Link></td>
                            </tr>
                          ); })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              ) : !areasView ? (
                <>
                <Card className="p-3">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{dealPl} — {dealCardsShown.length} deal{dealCardsShown.length === 1 ? "" : "s"}</div>
                  <CrmQuickView stages={dealColumns.map((s) => ({ key: s.key, label: s.label }))} pipelineStages={{ [dealPl]: dealColumns.map((s) => ({ key: s.key, label: s.label })) }} />
                  <CrmKanban columns={dealColumns} cards={dealCardsShown} counts={dealCounts} canSms={comms.sms} canCall={comms.call} dialerBase={comms.call ? `/crm/dialer?pl=${encodeURIComponent(dealPl)}` : ""} currentPipeline={dealPl} pipelineNames={movePipes.map((p) => p.name)} pipelineGroups={Object.fromEntries(movePipes.map((p) => [p.name, crmGroupOf(p.name, crmMap)]))} pipelineStages={moveStages} listHref={`/crm?pl=${encodeURIComponent(dealPl)}&view=list`} who="all" />
                </Card>

                {/* ⏰ Overdue buyer follow-ups — promised chases that slipped */}
                {overdueFollowups.length > 0 && (
                  <Card className="border-l-4 border-rose-400 p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm font-extrabold text-rose-800">⏰ {overdueFollowups.length} buyer follow-up{overdueFollowups.length === 1 ? "" : "s"} overdue <Link href="/dispo?tab=nextup" className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 hover:bg-rose-200">open Next Up →</Link></div>
                    <div className="space-y-1">
                      {overdueFollowups.slice(0, 10).map((c) => (
                        <div key={`${c.oppId}-${c.entryId}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-rose-50/60 px-2.5 py-1.5 ring-1 ring-rose-100">
                          <Link href={`/crm/${c.oppId}`} className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-800 hover:underline">{c.name} <span className="font-normal text-slate-400">· 📦 {c.dealAddr}</span></Link>
                          <span className="shrink-0 text-[10px] font-semibold text-rose-600">due {c.nextFollowUp}</span>
                          <form action={logDispoBuyerTouchAction} className="shrink-0"><input type="hidden" name="oppId" value={c.oppId} /><input type="hidden" name="entryId" value={c.entryId} /><button className="rounded bg-sky-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-sky-700">📞 Touch</button></form>
                        </div>
                      ))}
                      {overdueFollowups.length > 10 && <div className="mt-1.5 text-[11px] text-slate-400">+ {overdueFollowups.length - 10} more overdue — see Next Up.</div>}
                    </div>
                  </Card>
                )}

                {/* 🥶 Going cold — out to buyers but under 3 offers and stalled 2+ days */}
                {coldDeals.length > 0 && (
                  <Card className="border-l-4 border-amber-400 p-3">
                    <div className="mb-1.5 text-sm font-extrabold text-amber-800">🥶 {coldDeals.length} deal{coldDeals.length === 1 ? "" : "s"} going cold — out to buyers, under {OFFER_GOAL} offers, no movement in {COLD_DAYS}+ days</div>
                    <p className="mb-2 text-[11px] text-slate-500">These are out but stalling below the {OFFER_GOAL}-offer goal. Chase the attached buyers for a price, run the cascade to more buyers, or log the offers you already have.</p>
                    <div className="space-y-1">
                      {coldDeals.slice(0, 12).map((c) => (
                        <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50/60 px-2.5 py-1.5 ring-1 ring-amber-100">
                          <Link href={`/crm/${c.id}`} className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-800 hover:underline">{c.contactName}{c.address ? <span className="font-normal text-slate-400"> · {c.address}</span> : null}</Link>
                          <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">💰 {c.offers?.live ?? 0}/{OFFER_GOAL}</span>
                          <span className="shrink-0 text-[10px] font-semibold text-slate-400">cold {c.ageDays}d</span>
                          <form action={runDispoCascadeAction} className="shrink-0"><input type="hidden" name="oppId" value={c.id} /><button className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-700" title="Attach more matched buyers">⚡ More buyers</button></form>
                        </div>
                      ))}
                      {coldDeals.length > 12 && <div className="mt-1.5 text-[11px] text-slate-400">+ {coldDeals.length - 12} more going cold.</div>}
                    </div>
                  </Card>
                )}

                {/* 🚨 Not out yet — pre-marketing deals with no buyers; one click arms the cascade. Below the board (Jon 2026-10-21: pipeline first) */}
                {notOutDeals.length > 0 && (
                  <Card className="border-l-4 border-red-400 p-3">
                    <div className="mb-1.5 text-sm font-extrabold text-red-800">🚨 {notOutDeals.length} deal{notOutDeals.length === 1 ? "" : "s"} not out yet — before marketing, no buyers attached</div>
                    <p className="mb-2 text-[11px] text-slate-500">These haven&apos;t reached the agents/buyers stage and have no buyers attached. Hit <b>⚡ Run cascade</b> to attach the top matched buyers, then work the follow-ups.</p>
                    <div className="space-y-1">
                      {notOutDeals.slice(0, 12).map((c) => (
                        <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50/60 px-2.5 py-1.5 ring-1 ring-red-100">
                          <Link href={`/crm/${c.id}`} className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-800 hover:underline">{c.contactName}{c.address ? <span className="font-normal text-slate-400"> · {c.address}</span> : null}</Link>
                          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{dealColumns.find((s) => s.key === c.stage)?.label ?? c.stage}</span>
                          <form action={runDispoCascadeAction} className="shrink-0">
                            <input type="hidden" name="oppId" value={c.id} />
                            <button className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700">⚡ Run cascade</button>
                          </form>
                        </div>
                      ))}
                    </div>
                    {notOutDeals.length > 12 && <div className="mt-1.5 text-[11px] text-slate-400">+ {notOutDeals.length - 12} more — work them top to bottom.</div>}
                  </Card>
                )}
                </>
              ) : (
                <>
                  <Card className="border-l-4 border-emerald-400 p-4">
                    <div className="text-sm font-extrabold text-slate-800">🗺 Deals by area — one market at a time</div>
                    <p className="mt-0.5 text-[12px] text-slate-500">Every deal in <b>{dealPl}</b> grouped by city. When the same agent or developer is buying across a market (e.g. 22 parcels across 11 sellers in Cape Coral), attach them to <b>every</b> deal here in one click instead of opening each lead. The chips show who&apos;s already working the area and on how many deals.</p>
                  </Card>
                  {areaGroups.length === 0 ? (
                    <Card className="p-8 text-center text-sm text-slate-400">No deals to group {q ? "for that search" : "yet"}.</Card>
                  ) : areaGroups.map((g) => (
                    <Card key={g.key} className="p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-extrabold text-slate-800">📍 {g.label} <span className="font-semibold text-slate-400">· {g.cards.length} deal{g.cards.length === 1 ? "" : "s"}</span></div>
                        {g.attached.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {g.attached.map((a, i) => (
                              <span key={i} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">{a.kind === "buyer_agent" ? "🧑‍💼" : "🏗"} {a.name} · {a.count}/{g.cards.length}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* 🔗 one move: attach a buyer/agent to EVERY deal in this market */}
                      {buyerOptions.length > 0 && (
                        <form action={bulkAttachNetworkBuyerToDealsAction} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-100">
                          <input type="hidden" name="oppIds" value={g.dealIds.join(",")} />
                          <input type="hidden" name="back" value={`/dispo?tab=deals&view=areas${dealPl ? `&dealpl=${encodeURIComponent(dealPl)}` : ""}`} />
                          <span className="text-[11px] font-bold text-slate-500">🔗 Attach to all {g.cards.length} deal{g.cards.length === 1 ? "" : "s"}:</span>
                          <select name="networkOppId" required defaultValue="" className="min-w-[200px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-semibold text-slate-700">
                            <option value="" disabled>Pick a buyer / agent…</option>
                            {["🧑‍💼 Buyer agents", "🏗 Developers"].map((gr) => {
                              const items = buyerOptions.filter((b) => b.group === gr);
                              return items.length ? <optgroup key={gr} label={gr}>{items.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</optgroup> : null;
                            })}
                          </select>
                          <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-emerald-700">Attach to area →</button>
                        </form>
                      )}
                      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                        {g.cards.map((c) => (
                          <Link key={c.id} href={`/crm/${c.id}`} className="block rounded-lg bg-white px-2.5 py-2 ring-1 ring-slate-200 hover:bg-slate-50">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[13px] font-bold text-slate-800">{c.contactName}</span>
                              <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{dealColumns.find((s) => s.key === c.stage)?.label ?? c.stage}</span>
                            </div>
                            {c.address && <div className="mt-0.5 truncate text-[11px] text-slate-500">📍 {c.address}</div>}
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                              {c.money && <span className="font-bold text-emerald-600">{c.money}</span>}
                              {c.phone && <span>{c.phone}</span>}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </Card>
                  ))}
                </>
              )}
            </>
          )}

          {/* the buyer follow-ups attached to these deals */}
          <details className="rounded-2xl bg-white p-3 ring-1 ring-slate-200" open={followCards.length > 0}>
            <summary className="cursor-pointer text-[13px] font-bold text-slate-700">📞 Buyer follow-ups on these deals <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-[11px] font-bold text-slate-500">{followCards.length}</span>{dueToday > 0 && <span className="ml-1 rounded-full bg-red-100 px-1.5 text-[11px] font-bold text-red-700">{dueToday} due</span>}</summary>
            {followCards.length === 0 ? (
              <p className="mt-2 text-[12px] text-slate-500">None yet. Open a deal above → its <b>📇 Buyers &amp; agents</b> panel → <b>🔗 Attach from buyer network</b>, and the buyers you&apos;re chasing show up here.</p>
            ) : (
              <div className="mt-2">
                <DispoFollowupKanban cards={followCards} today={today} />
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                  {DISPO_BUYER_STAGES.map((s) => <span key={s.key}><span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${s.dot}`} />{s.label}</span>)}
                </div>
              </div>
            )}
          </details>
        </>
      )}

      {(tab === "developers" || tab === "agents") && (
        <>
          {tab === "agents" ? (
            <Card className="border-l-4 border-sky-400 p-3 text-[12px] text-slate-600">
              <b className="text-sky-800">🧑‍💼 Buyer agents = daily priority.</b> These get attached to deals and worked actively — open an agent to see every deal they&apos;re on, when you last talked, and what they offered. Attach/track from each deal&apos;s <b>📇 Buyers &amp; agents</b> panel.
            </Card>
          ) : (
            <Card className="border-l-4 border-violet-400 p-3 text-[12px] text-slate-600">
              <b className="text-violet-800">🏗 Developers = end-of-week vetting (lowest priority).</b> Work deals + buyer-agent follow-ups first; use the back half of the week to vet more developers here and keep building the vetted-developer pipeline.
            </Card>
          )}
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
              <CrmKanban columns={netColumns} cards={netCards} counts={netCounts} canSms={comms.sms} canCall={comms.call} dialerBase={comms.call ? `/crm/dialer?pl=${encodeURIComponent(networkPipeline)}` : ""} currentPipeline={networkPipeline} pipelineNames={[networkPipeline]} pipelineStages={{ [networkPipeline]: netColumns.map((s) => ({ key: s.key, label: s.label })) }} listHref={`/dispo?tab=${tab}&view=list`} who="all" />
            </Card>
          )}
        </>
      )}

      {tab === "team" && (
        <>
          <Card className="border-l-4 border-emerald-400 p-4">
            <div className="text-sm font-extrabold text-slate-800">👥 Dispositions — two lanes, one team</div>
            <p className="mt-0.5 text-[12px] text-slate-500">Clear ownership so Sharyn &amp; Marie are always on the same page — and so dispo keeps running if either is out. Both can see both lanes.</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-sky-50 p-2.5 text-[12px] ring-1 ring-sky-100"><b className="text-sky-800">📞 Sharyn — Outreach &amp; systems</b><div className="text-slate-600">Calls, follow-ups, lining up buyers/agents, arming sends.</div></div>
              <div className="rounded-lg bg-violet-50 p-2.5 text-[12px] ring-1 ring-violet-100"><b className="text-violet-800">🗂 Marie — Data &amp; organization</b><div className="text-slate-600">Intake data complete, every deal marketed, board kept clean.</div></div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card className="p-3">
              <div className="mb-2 flex items-center gap-2"><span className="text-[11px] font-bold uppercase tracking-wide text-sky-700">📞 Sharyn&apos;s lane — outreach</span><span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">{sharynQueue.length}</span></div>
              <div className="space-y-1.5">
                {sharynQueue.length === 0 && <p className="py-2 text-center text-[12px] text-slate-400">✅ All caught up — no calls/outreach due.</p>}
                {sharynQueue.slice(0, 40).map((it, i) => (
                  <Link key={`${it.oppId}-${i}`} href={`/crm/${it.oppId}`} className={`block rounded-lg px-2.5 py-1.5 ring-1 ${it.urgent ? "bg-red-50 ring-red-200" : "bg-slate-50 ring-slate-100"} hover:bg-white`}>
                    <div className="text-[12px] font-bold text-slate-800">{it.label}</div>
                    <div className="text-[10px] text-slate-500">{it.detail}</div>
                  </Link>
                ))}
              </div>
            </Card>
            <Card className="p-3">
              <div className="mb-2 flex items-center gap-2"><span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">🗂 Marie&apos;s lane — data &amp; marketing</span><span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">{marieQueue.length}</span></div>
              <div className="space-y-1.5">
                {marieQueue.length === 0 && <p className="py-2 text-center text-[12px] text-slate-400">✅ All caught up — intake + marketing complete.</p>}
                {marieQueue.slice(0, 40).map((it, i) => (
                  <Link key={`${it.oppId}-${i}`} href={`/crm/${it.oppId}`} className={`block rounded-lg px-2.5 py-1.5 ring-1 ${it.urgent ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-100"} hover:bg-white`}>
                    <div className="text-[12px] font-bold text-slate-800">{it.label}</div>
                    <div className="text-[10px] text-slate-500">{it.detail}</div>
                  </Link>
                ))}
                {devCount > 0 && <Link href="/dispo?tab=developers" className="block rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] font-bold text-slate-700 ring-1 ring-slate-100 hover:bg-white">🏗 {devCount} developers in the vetting pool → keep working the board</Link>}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
