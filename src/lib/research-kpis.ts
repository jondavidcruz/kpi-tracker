import { db } from "./db";

// Auto-tracked dispo KPIs derived straight from Buyer Research activity — no
// self-reporting. Each is recomputed from the attribution columns and written as
// a real KPI Entry so it flows into the scorecard/report/alerts like any other.
const KEYS = { added: "new_buyers", box: "buy_boxes_captured", vetted: "buyers_vetted", touched: "developers_contacted" };

export function orgToday(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/** Recompute today's Research-derived counts for a rep and upsert their KPI entries.
 *  Credits anyone whose PRIMARY or SECONDARY role is dispositions (these KPIs live
 *  on that scorecard) — hybrids like Michelle (acq primary, dispo secondary) count. */
export async function rollupResearchKpis(userId: string, date: string): Promise<void> {
  if (!userId || !date) return;
  const user = await db.user.findUnique({ where: { id: userId }, select: { position: true, name: true } });
  if (!user) return;
  const { secondaryPositionOf } = await import("./roles");
  const isDispo = user.position === "dispositions" || secondaryPositionOf(user) === "dispositions";
  if (!isDispo) return; // don't credit managers/other roles

  const kpis = await db.kpi.findMany({ where: { key: { in: Object.values(KEYS) } }, select: { id: true, key: true } });
  const idOf = (k: string) => kpis.find((x) => x.key === k)?.id;

  // 🧲 Counts come from the KANBAN now (Jon 2026-10-27: "the KPIs should be attached to the
  // Kanban"), since Buyer Research was retired. Attributed to the rep by assignedTo (new cards)
  // and by the event actor (vetting stage-moves + contacts). buy_boxes stays on the legacy
  // MarketContact count (reps also enter it manually; this never clobbers a manual entry).
  const { resolveNetworkPipelines } = await import("./dispo-network");
  const { getSettings } = await import("./data");
  const net = await resolveNetworkPipelines();
  const tz = (await getSettings()).orgTimezone;
  const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const since = new Date(Date.now() - 40 * 3600 * 1000); // wide enough to cover "today" in any tz
  const netOppIds = new Set((net.all.length ? await db.crmOpportunity.findMany({ where: { pipeline: { in: net.all } }, select: { id: true } }) : []).map((o) => o.id));

  // new buyers = network cards this rep created today
  const freshOpps = net.all.length ? await db.crmOpportunity.findMany({ where: { pipeline: { in: net.all }, assignedTo: user.name, createdAt: { gte: since } }, select: { createdAt: true } }) : [];
  const newBuyers = freshOpps.filter((o) => dayOf(o.createdAt) === date).length;

  // vetting stage-moves + contacts this rep logged today, on network cards
  const myEvents = await db.crmEvent.findMany({ where: { actor: user.name, at: { gte: since }, kind: { in: ["stage", "call", "sms", "email"] } }, select: { kind: true, body: true, at: true, contactId: true, oppId: true } }).catch(() => []);
  let vetted = 0; const contacted = new Set<string>();
  for (const e of myEvents) {
    if (dayOf(e.at) !== date) continue;
    const onNetwork = (e.oppId && netOppIds.has(e.oppId));
    if (!onNetwork) continue;
    if (e.kind === "stage" && /→\s*(vetted|active)\b/i.test(e.body)) vetted++;
    else if (e.kind !== "stage" && e.contactId) contacted.add(e.contactId);
  }

  const counts: Record<string, number> = {
    [KEYS.added]: newBuyers,
    [KEYS.box]: await db.marketContact.count({ where: { boxById: userId, boxOn: date } }),
    [KEYS.vetted]: vetted,
    [KEYS.touched]: contacted.size,
  };

  for (const [key, value] of Object.entries(counts)) {
    const kpiId = idOf(key);
    if (!kpiId) continue;
    const existing = await db.entry.findFirst({ where: { kpiId, userId, date } });
    if (existing) {
      // Only overwrite our own auto entries — never clobber a manual correction.
      if (existing.enteredBy === "research") await db.entry.update({ where: { id: existing.id }, data: { value } });
    } else if (value > 0) {
      await db.entry.create({ data: { kpiId, userId, date, value, enteredBy: "research" } });
    }
  }
}
