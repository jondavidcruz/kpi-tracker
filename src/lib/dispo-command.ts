// ☀️ Dispo Command Center data (Jon 2026-10-22). One query pass over the open dispo
// deals that answers "what do Marie & Sharyn work right now?" — deals out that still
// need offers, buyer follow-ups due today, deals going stale, deals not out yet, hot
// inbound replies, and the hottest buyers. Everything the dispo flow already records,
// pulled into one prioritized board. Server-only (imports db).
import { db } from "@/lib/db";
import { formatAddress } from "@/lib/address";
import { readDispoBuyers } from "@/lib/dispo-buyers";
import { readDispoOffers, offerStats, OFFER_GOAL } from "@/lib/dispo-offers";
import { buyerHeat, type Heat } from "@/lib/buyer-heat";

const ptToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

// the de-facto "this deal is out to buyers" stage test, shared across the dispo UI
const MARKET_RX = /sent to (buyer|agent)|on market|marketing|cascade|\bjvp\b/i;

export type CmdDeal = { id: string; addr: string; owner: string; stage: string; liveOffers: number; ageDays: number; value: string; daysInStage?: number };
export type CmdFollowup = { oppId: string; entryId: string; name: string; kind: string; phone?: string; dealAddr: string; nextFollowUp: string; overdueDays: number; stage: string };
export type CmdReply = { oppId: string; addr: string; who: string; channel: string; snippet: string; atIso: string };
export type CmdHotBuyer = { key: string; name: string; phone?: string; buyerId?: string; heat: Heat; deals: number; offers: number };
// 📋 per-rep accountability — hold Marie & Sharyn to their deals (Jon 2026-10-23)
export type CmdRep = { name: string; deals: number; overdue: number; dueToday: number; needOffers: number; stuck: number; idle: number };

export type DispoCommand = {
  generatedAt: string;
  summary: { out: number; needOffers: number; dueToday: number; overdue: number; aging: number; notOut: number; replies: number; stuck: number };
  needsOffers: CmdDeal[];
  followupsDue: CmdFollowup[];
  noNextStep: CmdFollowup[];
  aging: CmdDeal[];
  notOut: CmdDeal[];
  stuck: CmdDeal[];
  hotReplies: CmdReply[];
  hotBuyers: CmdHotBuyer[];
  reps: CmdRep[];
};

const AGING_DAYS = 4; // out this long with no movement = stale
const STUCK_DAYS = 6; // no stage movement this long on an open deal = stuck

export async function getDispoCommandData(): Promise<DispoCommand> {
  const { readPipelines } = await import("@/lib/crm");
  const { crmGroupOf, readPipelineCrm } = await import("@/lib/pipeline-crm");
  const { isDevNetworkName, isAgentNetworkName } = await import("@/lib/dispo-buyers");

  const pipelines = await readPipelines();
  const crmMap = await readPipelineCrm();
  const dealPipes = pipelines.filter((p) => p.name !== "War Room" && crmGroupOf(p.name, crmMap) === "dispositions" && !isDevNetworkName(p.name) && !isAgentNetworkName(p.name));
  const dealNames = dealPipes.map((p) => p.name);
  const stagesByPipe = new Map(dealPipes.map((p) => [p.name, p.stages.map((s) => ({ key: s.key, label: s.label }))]));

  const empty: DispoCommand = { generatedAt: new Date().toISOString(), summary: { out: 0, needOffers: 0, dueToday: 0, overdue: 0, aging: 0, notOut: 0, replies: 0, stuck: 0 }, needsOffers: [], followupsDue: [], noNextStep: [], aging: [], notOut: [], stuck: [], hotReplies: [], hotBuyers: [], reps: [] };
  if (!dealNames.length) return empty;

  const deals = await db.crmOpportunity.findMany({
    where: { archivedAt: null, pipeline: { in: dealNames } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, pipeline: true, stage: true, assignedTo: true, value: true, askPrice: true, updatedAt: true, createdAt: true, formData: true, contactId: true, contact: { select: { name: true, address: true } } },
  }).catch(() => []);
  if (!deals.length) return empty;

  // 🕒 when each deal last changed stage — to measure days-in-stage (velocity). The
  // latest kind:"stage" event per deal; fall back to createdAt when never moved.
  const stageEvs = await db.crmEvent.findMany({ where: { oppId: { in: deals.map((d) => d.id) }, kind: "stage" }, orderBy: { at: "desc" }, select: { oppId: true, at: true } }).catch(() => []);
  const stageAt = new Map<string, Date>();
  for (const e of stageEvs) if (e.oppId && !stageAt.has(e.oppId)) stageAt.set(e.oppId, e.at);

  const today = ptToday();
  const money = (v: number | null, ask: number | null) => (v != null ? `$${v.toLocaleString()}` : ask != null ? `ask $${ask.toLocaleString()}` : "");
  const ageOf = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86400000);
  const addrOf = (o: { title: string | null; contact: { address: string | null } | null }) => formatAddress(o.contact?.address || "") || o.title || "deal";

  // per-deal: is it out (past the marketing stage)?
  const pastCascade = (pipeline: string, stage: string): boolean => {
    const sts = stagesByPipe.get(pipeline) ?? [];
    const si = sts.findIndex((s) => s.key === stage);
    const mi = sts.findIndex((s) => MARKET_RX.test(s.label) || MARKET_RX.test(s.key));
    return si >= 0 && mi >= 0 && si >= mi;
  };
  const isClosedish = (stage: string) => /won|closed|sold|dead|died|nurtur|lost|no buyer/i.test(stage || "");

  const needsOffers: CmdDeal[] = [];
  const aging: CmdDeal[] = [];
  const notOut: CmdDeal[] = [];
  const stuck: CmdDeal[] = [];
  const followupsDue: CmdFollowup[] = [];
  const noNextStep: CmdFollowup[] = [];
  let outCount = 0;
  // per-rep accountability rollup (keyed by the deal's owner)
  const repMap = new Map<string, CmdRep>();
  const rep = (name: string) => { const k = name || "Unassigned"; let r = repMap.get(k); if (!r) { r = { name: k, deals: 0, overdue: 0, dueToday: 0, needOffers: 0, stuck: 0, idle: 0 }; repMap.set(k, r); } return r; };

  // heat aggregation across all deals
  const agg = new Map<string, { name: string; phone?: string; buyerId?: string; deals: Set<string>; offersMade: number; offersAccepted: number; following: number; lastTouch?: string }>();
  const bumpBuyer = (key: string, name: string, phone: string | undefined, buyerId: string | undefined) => {
    const r = agg.get(key) ?? { name, phone, buyerId, deals: new Set<string>(), offersMade: 0, offersAccepted: 0, following: 0 };
    if (!r.name && name) r.name = name;
    if (!r.phone && phone) r.phone = phone;
    if (!r.buyerId && buyerId) r.buyerId = buyerId;
    agg.set(key, r);
    return r;
  };

  for (const o of deals) {
    const open = !isClosedish(o.stage || "");
    const out = pastCascade(o.pipeline, o.stage || "");
    if (out && open) outCount++;
    const offers = offerStats(readDispoOffers(o.formData));
    const ageDays = ageOf(o.updatedAt);
    const daysInStage = ageOf(stageAt.get(o.id) ?? o.createdAt);
    const base: CmdDeal = { id: o.id, addr: addrOf(o), owner: o.assignedTo || "", stage: (o.stage || "").replace(/_/g, " "), liveOffers: offers.live, ageDays, value: money(o.value, o.askPrice), daysInStage };

    const repRec = open ? rep(o.assignedTo || "") : null;
    if (repRec) repRec.deals++;

    // deals out that still need offers
    if (out && open && offers.live < OFFER_GOAL) { needsOffers.push(base); if (repRec) repRec.needOffers++; }
    // deals out, open, stale
    if (out && open && ageDays >= AGING_DAYS) aging.push(base);
    // 🐌 stuck — open, past early intake, no stage movement in STUCK_DAYS (velocity killer)
    const parked = /nurtur|no buyer|\bdead\b|overpric|died|new|intake/i.test(o.stage || "");
    if (open && !parked && daysInStage >= STUCK_DAYS) { stuck.push(base); if (repRec) repRec.stuck++; }
    if (repRec && ageDays >= AGING_DAYS) repRec.idle++;

    const buyers = readDispoBuyers(o.formData);
    // not out yet + no buyers attached
    if (!out && open && buyers.length === 0) {
      const sts = stagesByPipe.get(o.pipeline) ?? [];
      const si = sts.findIndex((s) => s.key === o.stage);
      const lbl = si >= 0 ? sts[si].label : "";
      if (!/nurtur|no buyer|\bdead\b|overpric|died/i.test(lbl)) notOut.push(base);
    }

    const dealAddr = addrOf(o);
    for (const b of buyers) {
      // follow-ups due
      if (b.nextFollowUp && b.nextFollowUp <= today && b.stage !== "passed" && b.stage !== "offer_in") {
        const overdueDays = Math.max(0, Math.round((Date.parse(today + "T00:00:00") - Date.parse(b.nextFollowUp + "T00:00:00")) / 86400000));
        followupsDue.push({ oppId: o.id, entryId: b.id, name: b.name, kind: b.kind, phone: b.phone, dealAddr, nextFollowUp: b.nextFollowUp, overdueDays, stage: b.stage });
        if (repRec) { if (overdueDays > 0) repRec.overdue++; else repRec.dueToday++; }
      } else if (!b.nextFollowUp && b.stage !== "passed" && b.stage !== "offer_in") {
        // 👻 attached buyer with NO next-follow-up date → it will never surface in the
        // due list and silently slips. Flag it so a follow-up gets scheduled.
        noNextStep.push({ oppId: o.id, entryId: b.id, name: b.name, kind: b.kind, phone: b.phone, dealAddr, nextFollowUp: "", overdueDays: 0, stage: b.stage });
      }
      // heat
      const key = b.buyerId || b.name.toLowerCase();
      const r = bumpBuyer(key, b.name, b.phone, b.buyerId);
      r.deals.add(o.id);
      if (b.stage === "following_up" || b.stage === "offer_in") r.following++;
      if (b.lastContact && (!r.lastTouch || b.lastContact > r.lastTouch)) r.lastTouch = b.lastContact;
    }
    for (const of of readDispoOffers(o.formData)) {
      const key = of.buyerId || of.buyer.toLowerCase();
      const r = bumpBuyer(key, of.buyer, undefined, of.buyerId);
      r.offersMade++;
      if (of.status === "accepted") r.offersAccepted++;
    }
  }

  needsOffers.sort((a, b) => a.liveOffers - b.liveOffers || b.ageDays - a.ageDays);
  aging.sort((a, b) => b.ageDays - a.ageDays);
  stuck.sort((a, b) => (b.daysInStage ?? 0) - (a.daysInStage ?? 0));
  followupsDue.sort((a, b) => b.overdueDays - a.overdueDays || a.nextFollowUp.localeCompare(b.nextFollowUp));

  // hot inbound replies — last 3 days, on these deals
  const since = new Date(Date.now() - 3 * 86400000);
  const dealIds = deals.map((d) => d.id);
  const addrById = new Map(deals.map((d) => [d.id, addrOf(d)]));
  const evs = await db.crmEvent.findMany({
    where: { oppId: { in: dealIds }, kind: { in: ["sms", "email"] }, at: { gte: since } },
    orderBy: { at: "desc" }, take: 60,
    select: { oppId: true, kind: true, body: true, at: true, meta: true },
  }).catch(() => []);
  const hotReplies: CmdReply[] = [];
  for (const e of evs) {
    const meta = (e.meta ?? {}) as { dir?: string };
    const inbound = e.kind === "sms" ? /^[⬅]/.test(e.body) : (meta.dir === "inbound" || /^⬅|^re:|replied/i.test(e.body));
    if (!inbound) continue;
    const snippet = e.body.replace(/^[⬅➡️️\s]*(Seller|Buyer|Us|Them)?:?\s*/u, "").replace(/<[^>]+>/g, "").slice(0, 120);
    hotReplies.push({ oppId: e.oppId, addr: addrById.get(e.oppId) || "deal", who: "", channel: e.kind, snippet, atIso: e.at.toISOString() });
    if (hotReplies.length >= 10) break;
  }

  // hottest buyers
  const hotBuyers: CmdHotBuyer[] = [...agg.entries()]
    .map(([key, r]) => ({ key, name: r.name, phone: r.phone, buyerId: r.buyerId, deals: r.deals.size, offers: r.offersMade, heat: buyerHeat({ attachedDeals: r.deals.size, offersMade: r.offersMade, offersAccepted: r.offersAccepted, repliesFollowing: r.following, lastTouchYmd: r.lastTouch }) }))
    .filter((b) => b.name)
    .sort((a, b) => b.heat.score - a.heat.score)
    .slice(0, 8);

  const reps = [...repMap.values()]
    .filter((r) => r.name !== "Unassigned" || r.deals > 0)
    .sort((a, b) => (b.overdue + b.stuck) - (a.overdue + a.stuck) || b.deals - a.deals);

  return {
    generatedAt: new Date().toISOString(),
    summary: { out: outCount, needOffers: needsOffers.length, dueToday: followupsDue.filter((f) => f.overdueDays === 0).length, overdue: followupsDue.filter((f) => f.overdueDays > 0).length, aging: aging.length, notOut: notOut.length, replies: hotReplies.length, stuck: stuck.length },
    needsOffers: needsOffers.slice(0, 12),
    followupsDue: followupsDue.slice(0, 20),
    noNextStep: noNextStep.slice(0, 15),
    aging: aging.slice(0, 10),
    notOut: notOut.slice(0, 10),
    stuck: stuck.slice(0, 12),
    hotReplies,
    hotBuyers,
    reps,
  };
}
