import "server-only";
// 🏗→📣 Nightly push: researched developers from the Unvetted Developers kanban (DS: Developers)
// → DirectREI "unvetted buyers" campaign for mass email / call / SMS (Jon 2026-10-29: "DirectREI
// is our mass-marketing tool, the War Room is for real leads"). Formatted to the SAME DirectREI
// CSV template the cash-buyer engine uses. Deduped so a developer is pushed once. Delivery defaults
// to a CSV drop (email + Drive) for import; direct API add to the campaign only when DIRECTREI_WRITE=1.
import { db } from "@/lib/db";
import { resolveNetworkPipelines } from "@/lib/dispo-network";
import { buyerKey, type BuyerRow } from "@/lib/buyer-sheet";

const PUSHED_CAT = "__drei_dev_pushed__"; // dedupe store (keys of devs already pushed)
// Only UNVETTED devs go to mass marketing — not the ones already vetted or ruled out.
const SKIP_STAGES = new Set(["vetted", "not_fit"]);

// The DirectREI import template (identical columns to buyer-sheet.ts — Jon's template), with
// developer-appropriate Tags / Source. Contact Type stays "buyer" (developers buy our deals).
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
  ["Tags", (r) => `developer,unvetted buyer${(r.state || r.mailingState) ? `,${(r.state || r.mailingState || "").toUpperCase()}` : ""}`],
  ["Source", () => "War Room — researched developer"],
  ["Notes", (r) => r.notes || "Researched land developer / builder — unvetted. Mass-marketing to introduce our deals."],
];
function csvCell(s: string): string { const v = s ?? ""; return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
export function buildDevCsv(rows: BuyerRow[]): string {
  const header = CSV_COLS.map(([h]) => h).join(",");
  const body = rows.map((r) => CSV_COLS.map(([, f]) => csvCell(f(r))).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

async function readPushed(): Promise<Set<string>> {
  try { const row = await db.resource.findFirst({ where: { category: PUSHED_CAT } }); return new Set(row?.description ? (JSON.parse(row.description) as string[]) : []); }
  catch { return new Set(); }
}
async function writePushed(keys: Set<string>): Promise<void> {
  const description = JSON.stringify([...keys].slice(-20000)); // cap growth
  const row = await db.resource.findFirst({ where: { category: PUSHED_CAT } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "drei-dev-pushed", category: PUSHED_CAT, url: "", description } });
}

const US_STATE = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;
const COMPANYISH = /(llc|l\.l\.c|inc\b|corp|co\.|homes|home|builder|building|construction|development|develop|properties|property|group|capital|holdings|ventures|realty|investments|land|partners)/i;

/** One dev opp → the DirectREI buyer row. */
function devToRow(o: { title: string; formData: unknown; contact: { name: string | null; phone: string | null; email: string | null } | null }): BuyerRow {
  const fd = (o.formData ?? {}) as Record<string, Record<string, unknown>> & { __import?: { market?: string } };
  const dev = (fd.dev_buybox ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (v == null ? "" : Array.isArray(v) ? v.map(String).join(", ") : String(v)).trim();
  const name = (o.contact?.name || o.title || "").trim();
  const decision = s(dev.decisionMaker);
  const market = s(fd.__import?.market);
  const areas = s(dev.buyCounties);
  const stateM = (market.match(US_STATE) || areas.match(US_STATE))?.[0] || "";
  // Company = the dev name if it reads like a company; the decision-maker is the person.
  const isCo = COMPANYISH.test(name);
  const person = decision || (isCo ? "" : name);
  const parts = person.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || "",
    company: isCo ? name : (s(dev.brokerage) || (decision && decision !== name ? name : "")),
    phone: o.contact?.phone || "",
    email: o.contact?.email || "",
    state: stateM,
    mailingState: stateM,
    notes: [s(dev.priceRange) && `Pays ${s(dev.priceRange)}`, s(dev.landTypes) && `Buys ${s(dev.landTypes)}`, areas && `Areas: ${areas}`].filter(Boolean).join(" · ").slice(0, 240) || undefined,
  };
}

export type DevPushResult = { total: number; fresh: BuyerRow[]; skippedDup: number; skippedNoContact: number };

/** Collect NEW (never-pushed) unvetted developers from the kanban, as DirectREI rows. */
export async function collectUnvettedDevelopers(): Promise<DevPushResult> {
  const net = await resolveNetworkPipelines();
  if (!net.dev.length) return { total: 0, fresh: [], skippedDup: 0, skippedNoContact: 0 };
  const opps = await db.crmOpportunity.findMany({
    where: { archivedAt: null, pipeline: { in: net.dev }, stage: { notIn: [...SKIP_STAGES] } },
    select: { title: true, stage: true, formData: true, contact: { select: { name: true, phone: true, email: true } } },
  }).catch(() => []);
  const pushed = await readPushed();
  const seen = new Set<string>();
  const fresh: BuyerRow[] = [];
  let skippedDup = 0, skippedNoContact = 0;
  for (const o of opps) {
    const row = devToRow(o);
    if (!row.phone && !row.email) { skippedNoContact++; continue; } // nothing to market to
    const k = buyerKey(row);
    if (pushed.has(k) || seen.has(k)) { skippedDup++; continue; }
    seen.add(k);
    fresh.push(row);
  }
  return { total: opps.length, fresh, skippedDup, skippedNoContact };
}

/** Mark these rows as pushed so tonight's batch isn't re-sent tomorrow. */
export async function commitDevsPushed(rows: BuyerRow[]): Promise<void> {
  const pushed = await readPushed();
  for (const r of rows) pushed.add(buyerKey(r));
  await writePushed(pushed);
}
