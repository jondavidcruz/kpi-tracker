// ⛔ Market blacklist (Jon 2026-11-09): areas that are NOT worth our time — penny-lot
// markets where land sells cheap (e.g. Lehigh Acres) and the spreads are too thin to
// justify the work. We want land that sells ABOVE $50k. Stored as reserved Resource JSON
// (category __market_blacklist__) — no migration. Server-only (db).
import { db } from "./db";

const CAT = "__market_blacklist__";

export type BlacklistEntry = { id: string; area: string; reason: string; by: string; at: string };

// Seeded with Jon's first example. Lehigh Acres / Lee County is already measured at only
// 27% of land selling ≥$100k in land-sold.ts — the textbook "huge volume, penny lots" trap.
const SEED: BlacklistEntry[] = [
  {
    id: "seed-lehigh",
    area: "Lehigh Acres, FL (Lee County)",
    reason: "Penny lots — only ~27% of vacant land sells ≥$100k. Massive volume, tiny spreads. Not worth the time.",
    by: "Jon",
    at: "2026-11-09",
  },
];

const newId = () => Math.random().toString(36).slice(2, 10);

export async function readBlacklist(): Promise<BlacklistEntry[]> {
  try {
    const row = await db.resource.findFirst({ where: { category: CAT } });
    if (!row) {
      await db.resource.create({ data: { title: "market-blacklist", category: CAT, url: "", description: JSON.stringify(SEED) } });
      return SEED;
    }
    const list = JSON.parse(row.description || "[]");
    return Array.isArray(list) ? (list as BlacklistEntry[]).filter((e) => e && e.area) : [];
  } catch {
    return SEED;
  }
}

async function writeBlacklist(list: BlacklistEntry[]): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: CAT } });
  const description = JSON.stringify(list);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "market-blacklist", category: CAT, url: "", description } });
}

export async function addBlacklist(area: string, reason: string, by: string): Promise<void> {
  const a = (area || "").trim().slice(0, 120);
  if (!a) return;
  const list = await readBlacklist();
  if (list.some((e) => e.area.toLowerCase() === a.toLowerCase())) return; // no dupes
  list.unshift({ id: newId(), area: a, reason: (reason || "").trim().slice(0, 300), by, at: new Date().toISOString().slice(0, 10) });
  await writeBlacklist(list);
}

export async function removeBlacklist(id: string): Promise<void> {
  const list = (await readBlacklist()).filter((e) => e.id !== id);
  await writeBlacklist(list);
}

/** Client-safe name match — does a market/area name hit the blacklist? Pass the area
 *  strings (not the server list) from a client component. Matches on the leading place
 *  token so "Lehigh Acres, FL (Lee County)" flags "Lehigh Acres" and "Lee County". */
export function blacklistKeys(areas: string[]): string[] {
  const keys: string[] = [];
  for (const a of areas) {
    for (const part of a.split(/[(),]/)) {
      const k = part.trim().toLowerCase();
      if (k.length >= 4) keys.push(k);
    }
  }
  return keys;
}
