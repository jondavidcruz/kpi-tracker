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
// Readable slug from the property address → links read /offer/<address> (Jon
// 2026-10-20) instead of a random code.
export function slugify(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, "");
}

/** Create (or reuse) a short code for a URL, optionally tied to a lead + a readable
 *  slug hint (e.g. the property address). */
export async function createShortLink(url: string, meta: { contactId?: string; oppId?: string; by?: string; slug?: string } = {}): Promise<string> {
  const clean = url.trim();
  const map = await readAll();
  const existing = Object.values(map).find((l) => l.url === clean && l.contactId === (meta.contactId || undefined));
  if (existing) return existing.code;
  const base = meta.slug ? slugify(meta.slug) : "";
  let code = base || gen(); let n = 1; let tries = 0;
  // keep going until the code is free (or maps to this exact URL, which we'd reuse)
  while (map[code] && map[code].url !== clean && tries++ < 50) { n++; code = base ? `${base}-${n}` : gen(); }
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
