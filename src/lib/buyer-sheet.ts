import { db } from "@/lib/db";

// 💰 Cash-buyer / developer sourcing feed (Jon 2026-10-16: "build the cash-buyer
// engine every time + give me a daily Excel I can drop into the Direct REI
// dialer/SMS/email, buyers in our markets"). A daily scheduled Claude task pulls
// fresh cash land buyers from DealMachine (the app can't call that MCP itself) and
// POSTs the rows here; this module dedupes them all-time, builds a Direct-REI-
// ready CSV, and stores the latest feed. Markets: TX, FL, CA, TN, OK.
const SOURCED_CAT = "__cash_buyers_sourced__"; // all-time dedupe keys
const FEED_CAT = "__cash_buyers_feed__";       // latest sheet meta + rows for the page

export type BuyerRow = {
  firstName?: string; lastName?: string; company?: string;
  phone?: string; phone2?: string; email?: string;
  mailingStreet?: string; mailingCity?: string; mailingState?: string; mailingZip?: string;
  propertyAddress?: string; state?: string; lastSaleDate?: string; notes?: string;
};

const OUR_MARKETS = new Set(["TX", "FL", "CA", "TN", "OK"]);

/** A stable dedupe key for a buyer — phone if we have one, else name+mailing. */
export function buyerKey(r: BuyerRow): string {
  const ph = (r.phone || "").replace(/\D/g, "").slice(-10);
  if (ph.length === 10) return `p:${ph}`;
  const name = `${r.firstName || ""} ${r.lastName || ""} ${r.company || ""}`.trim().toLowerCase().replace(/\s+/g, " ");
  const mail = `${r.mailingStreet || ""} ${r.mailingZip || ""}`.trim().toLowerCase();
  return `n:${name}|${mail}`.slice(0, 120);
}

async function readKeys(): Promise<Set<string>> {
  const row = await db.resource.findFirst({ where: { category: SOURCED_CAT } }).catch(() => null);
  try { return new Set(row?.description ? (JSON.parse(row.description) as string[]) : []); } catch { return new Set(); }
}
async function writeKeys(keys: Set<string>): Promise<void> {
  // keep the most recent ~50k keys so the store can't grow unbounded
  const arr = [...keys].slice(-50000);
  const row = await db.resource.findFirst({ where: { category: SOURCED_CAT } });
  const description = JSON.stringify(arr);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "cash-buyers-sourced", category: SOURCED_CAT, url: "", description } });
}

/** Keep only buyers we've never exported before AND that sit in our 5 markets. */
export async function dedupeNewBuyers(rows: BuyerRow[]): Promise<{ fresh: BuyerRow[]; skippedDup: number; skippedMarket: number }> {
  const keys = await readKeys();
  const fresh: BuyerRow[] = [];
  let skippedDup = 0, skippedMarket = 0;
  const seenThisBatch = new Set<string>();
  for (const r of rows) {
    const st = (r.state || r.mailingState || "").trim().toUpperCase();
    if (st && !OUR_MARKETS.has(st)) { skippedMarket++; continue; }
    const k = buyerKey(r);
    if (keys.has(k) || seenThisBatch.has(k)) { skippedDup++; continue; }
    seenThisBatch.add(k);
    fresh.push(r);
  }
  // commit the new keys so tomorrow's run won't repeat them
  for (const k of seenThisBatch) keys.add(k);
  await writeKeys(keys);
  return { fresh, skippedDup, skippedMarket };
}

const CSV_COLS: Array<[string, (r: BuyerRow) => string]> = [
  ["First Name", (r) => r.firstName || ""],
  ["Last Name", (r) => r.lastName || ""],
  ["Company", (r) => r.company || ""],
  ["Phone", (r) => r.phone || ""],
  ["Phone 2", (r) => r.phone2 || ""],
  ["Email", (r) => r.email || ""],
  ["Mailing Street", (r) => r.mailingStreet || ""],
  ["Mailing City", (r) => r.mailingCity || ""],
  ["Mailing State", (r) => r.mailingState || r.state || ""],
  ["Mailing Zip", (r) => r.mailingZip || ""],
  ["Property Address", (r) => r.propertyAddress || ""],
  ["Market", (r) => (r.state || r.mailingState || "").toUpperCase()],
  ["Last Sale Date", (r) => r.lastSaleDate || ""],
  ["Contact Type", () => "buyer"],
  ["Tags", (r) => `cash buyer,land buyer,${(r.state || r.mailingState || "").toUpperCase()}`],
  ["Source", () => "DealMachine — cash land buyer"],
  ["Notes", (r) => r.notes || "Recently purchased vacant land (cash/arms-length) in a Freedom Offers market."],
];

function csvCell(s: string): string {
  const v = s ?? "";
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
export function buildBuyerCsv(rows: BuyerRow[]): string {
  const header = CSV_COLS.map(([h]) => h).join(",");
  const body = rows.map((r) => CSV_COLS.map(([, f]) => csvCell(f(r))).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

export async function storeBuyerFeed(meta: { date: string; count: number; link: string; byState: Record<string, number>; rows: BuyerRow[] }): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: FEED_CAT } });
  const description = JSON.stringify({ ...meta, rows: meta.rows.slice(0, 500) });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "cash-buyers-feed", category: FEED_CAT, url: "", description } });
}
export async function readBuyerFeed(): Promise<{ date: string; count: number; link: string; byState: Record<string, number>; rows: BuyerRow[] } | null> {
  const row = await db.resource.findFirst({ where: { category: FEED_CAT } }).catch(() => null);
  try { return row?.description ? JSON.parse(row.description) : null; } catch { return null; }
}
