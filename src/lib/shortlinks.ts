import { db } from "@/lib/db";

// 🔗 Owned link shortener + click tracking (Jon 2026-10-20: "shorten links in texts
// and track them"). Google's URL shortener (goo.gl) was shut down, so these are our
// own short links on the app's domain — kpi-tracker-lovat.vercel.app/l/<code> — which
// also logs a click to the lead's timeline when the seller opens it. No schema change:
// stored as a JSON map in a Resource side-store.
const CAT = "__shortlinks__";

export const SHORT_BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://kpi-tracker-lovat.vercel.app").replace(/\/$/, "");

export type ShortLink = { code: string; url: string; contactId?: string; oppId?: string; by?: string; created: string; clicks: number; lastClick?: string };

async function readAll(): Promise<Record<string, ShortLink>> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  try { return row?.description ? (JSON.parse(row.description) as Record<string, ShortLink>) : {}; } catch { return {}; }
}
async function writeAll(map: Record<string, ShortLink>): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  const description = JSON.stringify(map);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "shortlinks", category: CAT, url: "", description } });
}
function gen(): string {
  const a = "abcdefghijkmnpqrstuvwxyz23456789"; // no look-alikes (0/o/1/l)
  let s = ""; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

/** Create (or reuse) a short code for a URL, optionally tied to a lead for tracking. */
export async function createShortLink(url: string, meta: { contactId?: string; oppId?: string; by?: string } = {}): Promise<string> {
  const clean = url.trim();
  const map = await readAll();
  const existing = Object.values(map).find((l) => l.url === clean && l.contactId === (meta.contactId || undefined));
  if (existing) return existing.code;
  let code = gen(); let tries = 0;
  while (map[code] && tries++ < 10) code = gen();
  map[code] = { code, url: clean, contactId: meta.contactId, oppId: meta.oppId, by: meta.by, created: new Date().toISOString(), clicks: 0 };
  await writeAll(map);
  return code;
}

/** Resolve a code → record, incrementing its click count. */
export async function resolveAndTrack(code: string): Promise<ShortLink | null> {
  const map = await readAll();
  const l = map[code];
  if (!l) return null;
  l.clicks = (l.clicks ?? 0) + 1;
  l.lastClick = new Date().toISOString();
  await writeAll(map).catch(() => {});
  return l;
}
