import "server-only";
// 📊 Page-view usage tracker (Jon 2026-11-04: "make 'what's unused' data, not guesses").
// Egress-conscious by design: the client beacon fires at most once per path per user per day
// (localStorage-deduped), so a ~10-person team generates a few hundred tiny writes a day, not
// one per navigation. Stored in the Resource table (no migration): one row per normalized
// path, category "__pageviews__", sortOrder = total views (atomic increment), description =
// last-seen ISO timestamp.
import { db } from "@/lib/db";

const CAT = "__pageviews__";

/** Strip query/hash and collapse id-ish segments to ":id" so /crm/<cuid> rolls up to /crm/:id. */
export function normUsagePath(raw: string): string {
  let p = (raw || "/").split("?")[0].split("#")[0].trim();
  if (p.length > 1) p = p.replace(/\/+$/, "");
  if (!p.startsWith("/")) return "";
  const idish = (s: string) =>
    /^[0-9]+$/.test(s) ||
    /^c[a-z0-9]{20,}$/i.test(s) ||                       // cuid
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(s) ||   // uuid
    s.length > 20;
  return p.split("/").map((s, i) => (i > 0 && idish(s) ? ":id" : s)).join("/") || "/";
}

/** Record one view. Called from the beacon endpoint; never throws. */
export async function trackView(path: string): Promise<void> {
  const p = normUsagePath(path);
  if (!p || p.length > 160) return;
  const now = new Date().toISOString();
  const existing = await db.resource.findFirst({ where: { category: CAT, title: p }, select: { id: true } }).catch(() => null);
  if (existing) {
    await db.resource.update({ where: { id: existing.id }, data: { sortOrder: { increment: 1 }, description: now } }).catch(() => {});
  } else {
    await db.resource.create({ data: { category: CAT, title: p, url: "", sortOrder: 1, description: now } }).catch(() => {});
  }
}

export type UsageRow = { path: string; views: number; lastAt: string };

/** All tracked paths, most-used first. Duplicate rows for the same path (a rare create race)
 *  are summed so the count stays honest. */
export async function getUsage(): Promise<UsageRow[]> {
  const rows = await db.resource.findMany({ where: { category: CAT }, select: { title: true, sortOrder: true, description: true } }).catch(() => []);
  const byPath = new Map<string, UsageRow>();
  for (const r of rows) {
    const cur = byPath.get(r.title);
    if (cur) { cur.views += r.sortOrder; if (r.description > cur.lastAt) cur.lastAt = r.description; }
    else byPath.set(r.title, { path: r.title, views: r.sortOrder, lastAt: r.description || "" });
  }
  return [...byPath.values()].sort((a, b) => b.views - a.views);
}
