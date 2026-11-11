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

// 🏖 Known FL penny-lot / sub-$50k markets — pre-written so Jon doesn't add them one by one
// (Jon 2026-11-11). These are the classic "huge volume, tiny spread" lot-mill areas where vacant
// land sells cheap. Injected ONCE into the live blacklist (deduped, still removable). Cape Coral /
// Punta Gorda are intentionally NOT here — their canal/waterfront lots are >$50k targets.
const DEFAULT_BLACKLIST: BlacklistEntry[] = [
  { id: "def-golden-gate", area: "Golden Gate Estates, FL (Collier County)", reason: "Penny lot-mill — huge inventory of cheap dry acreage; thin spreads under $50k.", by: "Built-in", at: "2026-11-11" },
  { id: "def-citrus-springs", area: "Citrus Springs, FL (Citrus County)", reason: "Classic cheap-lot subdivision; vacant lots routinely sell under $50k.", by: "Built-in", at: "2026-11-11" },
  { id: "def-marion-oaks", area: "Marion Oaks, FL (Marion County)", reason: "High-volume penny lots; spreads too thin to work.", by: "Built-in", at: "2026-11-11" },
  { id: "def-poinciana", area: "Poinciana, FL (Polk/Osceola County)", reason: "Mass-platted cheap lots; land value well under $50k.", by: "Built-in", at: "2026-11-11" },
  { id: "def-palm-bay", area: "Palm Bay, FL (Brevard County)", reason: "GDC-era penny lots in massive volume; tiny spreads.", by: "Built-in", at: "2026-11-11" },
  { id: "def-indian-lake", area: "Indian Lake Estates, FL (Polk County)", reason: "Cheap rural lots; land sells under $50k.", by: "Built-in", at: "2026-11-11" },
  { id: "def-interlachen", area: "Interlachen, FL (Putnam County)", reason: "Low-value rural/penny lots; not worth the work.", by: "Built-in", at: "2026-11-11" },
  { id: "def-rotonda", area: "Rotonda West interior, FL (Charlotte County)", reason: "Interior (non-waterfront) penny lots; thin spreads. (Waterfront Rotonda is separate.)", by: "Built-in", at: "2026-11-11" },
  { id: "def-burnt-store", area: "Burnt Store Lakes, FL (Charlotte County)", reason: "Freshwater/interior penny lots under $50k. (Burnt Store Isles waterfront is separate.)", by: "Built-in", at: "2026-11-11" },
  { id: "def-deltona", area: "Deltona, FL (Volusia County)", reason: "Large supply of cheap infill lots; low spreads.", by: "Built-in", at: "2026-11-11" },
];

const SEEDED_CAT = "__market_blacklist_seeded__"; // one-time marker so defaults inject only once

export async function readBlacklist(): Promise<BlacklistEntry[]> {
  try {
    const row = await db.resource.findFirst({ where: { category: CAT } });
    let list: BlacklistEntry[];
    if (!row) {
      list = [...SEED];
      await db.resource.create({ data: { title: "market-blacklist", category: CAT, url: "", description: JSON.stringify(list) } });
    } else {
      const parsed = JSON.parse(row.description || "[]");
      list = Array.isArray(parsed) ? (parsed as BlacklistEntry[]).filter((e) => e && e.area) : [];
    }
    // One-time inject of the known penny-lot defaults (deduped by area). Marked so it never repeats
    // — after this, they're normal entries Jon can remove like any other.
    const seeded = await db.resource.findFirst({ where: { category: SEEDED_CAT } }).catch(() => null);
    if (!seeded) {
      const have = new Set(list.map((e) => e.area.toLowerCase().trim()));
      const toAdd = DEFAULT_BLACKLIST.filter((d) => !have.has(d.area.toLowerCase().trim()));
      if (toAdd.length) { list = [...list, ...toAdd]; await writeBlacklist(list); }
      await db.resource.create({ data: { title: "blacklist-seeded", category: SEEDED_CAT, url: "", description: "v1" } }).catch(() => {});
    }
    return list;
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
