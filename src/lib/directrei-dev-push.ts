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

// 📋 Jon's FINAL DirectREI import template (2026-11-03) — exact headers, so DirectREI maps the
// columns on import. Developers ride the "Seller" columns (DealMachine→DREI convention). Values
// are populated with the best data we have; the key markers are Seller Notes="Unvetted Developer"
// + Property Type="Developer".
const fullName = (r: BuyerRow) => `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || r.company || "";
const marketOf = (r: BuyerRow) => r.market || [r.city, (r.state || r.mailingState || "").toUpperCase()].filter(Boolean).join(" / ") || (r.state || r.mailingState || "").toUpperCase();
const CSV_COLS: Array<[string, (r: BuyerRow) => string]> = [
  ["Seller First Name", (r) => r.firstName || ""],
  ["Seller Last Name", (r) => r.lastName || ""],
  ["Seller Full Name", (r) => fullName(r)],
  ["Seller Company", (r) => r.company || ""],
  ["Seller Email", (r) => r.email || ""],
  ["Seller Email 2", (r) => r.email2 || ""],
  ["Seller Email 3", (r) => r.email3 || ""],
  ["Seller Phone", (r) => r.phone || ""],
  ["Seller Phone 2", (r) => r.phone2 || ""],
  ["Seller Phone 3", (r) => r.phone3 || ""],
  ["Mailing Street", (r) => r.mailingStreet || ""],
  ["Mailing City", (r) => r.mailingCity || r.city || ""],
  ["Mailing State", (r) => r.mailingState || r.state || ""],
  ["Mailing Zip", (r) => r.mailingZip || ""],
  ["Market / Metro", (r) => marketOf(r)],
  ["Motivation", () => ""],
  ["Reason for Selling", () => ""],
  ["Status", () => ""],
  ["Seller Notes", (r) => r.notes || "Unvetted Developer"],
  ["Property Address", (r) => r.propertyAddress || ""],
  ["Property City", () => ""],
  ["Property State", (r) => r.state || r.mailingState || ""],
  ["Property Zip", () => ""],
  ["Parcel ID", () => ""],
  ["Legal Description", () => ""],
  ["County", () => ""],
  ["Property Type", () => "Developer"],
  ["Lot Size", () => ""],
  ["Sqft", () => ""],
  ["Beds", () => ""],
  ["Baths", () => ""],
  ["Zoning", () => ""],
  ["Asking Price", () => ""],
  ["Estimated Value", () => ""],
  ["ARV", () => ""],
  ["Property Notes", () => ""],
  ["Links", () => ""],
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

type DevContact = { name: string | null; phone: string | null; email: string | null; altPhone?: string | null; altEmail?: string | null };
/** One dev opp → the DirectREI buyer row (with 2nd/3rd phone+email, city, market). */
function devToRow(o: { title: string; formData: unknown; contact: DevContact | null }): BuyerRow {
  const fd = (o.formData ?? {}) as Record<string, Record<string, unknown>> & { __import?: { market?: string; city?: string }; __extra?: { phone3?: string; email3?: string } };
  const dev = (fd.dev_buybox ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (v == null ? "" : Array.isArray(v) ? v.map(String).join(", ") : String(v)).trim();
  const name = (o.contact?.name || o.title || "").trim();
  const decision = s(dev.decisionMaker);
  const market = s(fd.__import?.market);
  const city = s(fd.__import?.city);
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
    phone2: s(o.contact?.altPhone),
    phone3: s(fd.__extra?.phone3),
    email: o.contact?.email || "",
    email2: s(o.contact?.altEmail),
    email3: s(fd.__extra?.email3),
    state: stateM,
    mailingState: stateM,
    city,
    market: market || [city, stateM].filter(Boolean).join(" / "),
    notes: [s(dev.priceRange) && `Pays ${s(dev.priceRange)}`, s(dev.landTypes) && `Buys ${s(dev.landTypes)}`, areas && `Areas: ${areas}`].filter(Boolean).join(" · ").slice(0, 240) || undefined,
  };
}

export type DevRow = BuyerRow & { oppId: string };
export type DevPushResult = { total: number; fresh: DevRow[]; skippedDup: number; skippedNoContact: number };

/** Collect NEW (never-pushed) unvetted developers from the kanban, as DirectREI rows (each
 *  carrying its oppId so the caller can ARCHIVE it out of the War Room once pushed). `limit`
 *  caps a run so the 2k+ backlog drains in batches within the serverless time budget. */
export async function collectUnvettedDevelopers(limit = 2000): Promise<DevPushResult> {
  const net = await resolveNetworkPipelines();
  if (!net.dev.length) return { total: 0, fresh: [], skippedDup: 0, skippedNoContact: 0 };
  const opps = await db.crmOpportunity.findMany({
    where: { archivedAt: null, pipeline: { in: net.dev }, stage: { notIn: [...SKIP_STAGES] } },
    select: { id: true, title: true, stage: true, formData: true, contact: { select: { name: true, phone: true, email: true, altPhone: true, altEmail: true } } },
    orderBy: { createdAt: "asc" },
  }).catch(() => []);
  const pushed = await readPushed();
  const seen = new Set<string>();
  const fresh: DevRow[] = [];
  let skippedDup = 0, skippedNoContact = 0;
  for (const o of opps) {
    const row = devToRow(o);
    if (!row.phone && !row.email) { skippedNoContact++; continue; } // nothing to market to
    const k = buyerKey(row);
    if (pushed.has(k) || seen.has(k)) { skippedDup++; continue; }
    seen.add(k);
    fresh.push({ ...row, oppId: o.id });
    if (fresh.length >= limit) break;
  }
  return { total: opps.length, fresh, skippedDup, skippedNoContact };
}

/** Mark these rows as pushed so tonight's batch isn't re-sent tomorrow. */
export async function commitDevsPushed(rows: BuyerRow[]): Promise<void> {
  const pushed = await readPushed();
  for (const r of rows) pushed.add(buyerKey(r));
  await writePushed(pushed);
}

export type DevPushRun = {
  scanned: number; pushCount: number; delivered: "api" | "csv" | "none"; archived: number;
  added?: number; errors?: string[]; skippedDup: number; skippedNoContact: number;
};

/** The full nightly job used by BOTH the cron (?devdrop=1&commit=1) and the owner "push & clear
 *  now" button: collect fresh unvetted developers → push API-direct into DirectREI (when
 *  DIRECTREI_WRITE=1) else email the exact-template import CSV → ARCHIVE them out of the War Room
 *  kanban so it stops clogging → mark pushed → post to the DirectREI chat. Never throws. */
export async function runDevPushAndClear(opts: { limit?: number; recipient?: string } = {}): Promise<DevPushRun> {
  const { collectUnvettedDevelopers: collect } = await import("@/lib/directrei-dev-push");
  const { total, fresh, skippedDup, skippedNoContact } = await collect(Math.max(1, Math.min(2000, opts.limit ?? 2000)));
  const base: DevPushRun = { scanned: total, pushCount: fresh.length, delivered: "none", archived: 0, skippedDup, skippedNoContact };
  if (!fresh.length) return base;
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const contacts = fresh.map((r) => ({
    name: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || r.company || "Developer",
    first_name: r.firstName, last_name: r.lastName, company: r.company,
    phone: r.phone, phone2: r.phone2, phone3: r.phone3,
    email: r.email, email2: r.email2, email3: r.email3,
    market: r.market, status: "Unvetted Developer", contact_type: "buyer",
    notes: r.notes || "Unvetted Developer", external_id: buyerKey(r),
  }));
  let delivered: DevPushRun["delivered"] = "none";
  let added = 0; const errors: string[] = [];
  const { directReiBlastConfigured, directReiAddToCampaignByName } = await import("@/lib/directrei");
  if (directReiBlastConfigured()) {
    try {
      for (let i = 0; i < contacts.length; i += 1000) {
        const r = await directReiAddToCampaignByName({ name: /unvetted buyer/i, createIfMissing: true, channels: ["email", "sms", "cold_call"], contacts: contacts.slice(i, i + 1000) });
        if ("added" in r && r.added) added += r.added; else if (r.error) errors.push(r.error);
      }
    } catch (e) { errors.push(String(e)); }
    if (added > 0) delivered = "api";
  } else {
    try {
      const csv = buildDevCsv(fresh);
      const recipient = (opts.recipient || "info@freedom-offers.com").split(",")[0].trim();
      const { sendEmailWithAttachment } = await import("@/lib/notify");
      const html = `<p><b>${fresh.length.toLocaleString()}</b> unvetted developers — DirectREI import CSV attached (import into the <b>Unvetted Buyers</b> campaign).</p><p style="color:#64748b;font-size:12px">Arm <code>DIRECTREI_WRITE=1</code> to push these straight in via the API and skip this step.</p>`;
      await sendEmailWithAttachment([recipient], `🏗 ${fresh.length} unvetted developers → DirectREI — ${date}`, html, { filename: `Unvetted_Developers_DREI_${date}.csv`, content: Buffer.from(csv).toString("base64") });
      try { const { gdriveConfigured, uploadToDrivePrivate } = await import("@/lib/gdrive"); if (gdriveConfigured()) await uploadToDrivePrivate(`Unvetted Developers DREI - ${date}.csv`, Buffer.from(csv), "text/csv"); } catch { /* best-effort */ }
      delivered = "csv"; errors.push("DIRECTREI_WRITE not armed — emailed the import CSV instead");
    } catch (e) { errors.push(`csv delivery failed: ${String(e)}`); }
  }
  let archived = 0;
  if (delivered !== "none") {
    await commitDevsPushed(fresh);
    try { const res = await db.crmOpportunity.updateMany({ where: { id: { in: fresh.map((r) => r.oppId) } }, data: { archivedAt: new Date() } }); archived = res.count; } catch { /* best-effort */ }
    try {
      const { postToSpace } = await import("@/lib/chat-spaces");
      const n = delivered === "api" ? added : fresh.length;
      const how = delivered === "api" ? "pushed API-direct into DirectREI (Unvetted Buyers)" : "emailed as a DirectREI import CSV";
      await postToSpace("directrei", `🏗 *${n.toLocaleString()} researched developers → DirectREI — ${date}*\n${how}, and cleared from the War Room (${archived.toLocaleString()} archived).`);
    } catch { /* best-effort */ }
  }
  return { ...base, delivered, archived, added: delivered === "api" ? added : undefined, errors: errors.slice(0, 3) };
}
