import { db } from "./db";

// Auto-tracked dispo KPIs derived straight from Buyer Research activity — no
// self-reporting. Each is recomputed from the attribution columns and written as
// a real KPI Entry so it flows into the scorecard/report/alerts like any other.
const KEYS = { added: "new_buyers", box: "buy_boxes_captured", vetted: "buyers_vetted" };

export function orgToday(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/** Recompute today's Research-derived counts for a rep and upsert their KPI entries.
 *  Only dispositions reps are credited (these KPIs live on that scorecard). */
export async function rollupResearchKpis(userId: string, date: string): Promise<void> {
  if (!userId || !date) return;
  const user = await db.user.findUnique({ where: { id: userId }, select: { position: true } });
  if (user?.position !== "dispositions") return; // don't credit managers/other roles

  const kpis = await db.kpi.findMany({ where: { key: { in: Object.values(KEYS) } }, select: { id: true, key: true } });
  const idOf = (k: string) => kpis.find((x) => x.key === k)?.id;

  const counts: Record<string, number> = {
    [KEYS.added]: await db.marketContact.count({ where: { addedById: userId, addedOn: date } }),
    [KEYS.box]: await db.marketContact.count({ where: { boxById: userId, boxOn: date } }),
    [KEYS.vetted]: await db.marketContact.count({ where: { vettedById: userId, vettedOn: date } }),
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
