import "server-only";
// 🧹 Weekly DirectREI lead cleanup (Jon 2026-10-29) — the account is capped at 5,000 contacts, so
// each week we remove the dead weight: opted-out, bad contact info, not interested, bounced/guessed
// emails. ANYTHING qualified / interested / replied is PROTECTED — never auto-deleted; it goes to a
// manual-review list so the team can confirm it's a real lead. Read-only here; deletion is a
// separate, gated step (see directReiDeleteContact). DirectREI = mass marketing, not real leads.
import { directReiContacts } from "@/lib/directrei";

/** Total contacts in the DirectREI account (for the 5,000-cap guardrail gauge). */
export async function directReiContactCount(): Promise<number | null> {
  const res = await directReiContacts({ page: "0", limit: "1" });
  if (!res.ok) return null;
  const b = res.body as { total_count?: number; total?: number; count?: number };
  const n = b?.total_count ?? b?.total ?? b?.count;
  return typeof n === "number" ? n : null;
}

export type CleanReason = "opted_out" | "bad_contact" | "not_interested" | "email_bounced" | "email_guess";
export const REASON_LABEL: Record<CleanReason, string> = {
  opted_out: "Opted out (SMS/email)",
  bad_contact: "Bad contact info",
  not_interested: "Not interested",
  email_bounced: "Email bounced",
  email_guess: "Email is a guess",
};

type DreiContact = {
  id?: string; contact_id?: string; name?: string; status?: string; email_status?: string; phone_status?: string;
  phone?: string; email?: string; tags?: string | string[];
  last_reply_at?: string | null; sms_opted_out_at?: string | null; email_opted_out_at?: string | null;
  needs_attention?: boolean;
};

const S = (v: unknown) => (v == null ? "" : Array.isArray(v) ? v.join(" ") : String(v)).toLowerCase();

/** Qualified / interested / replied → PROTECT (never delete; manual team review). */
export function isProtected(c: DreiContact): boolean {
  const st = S(c.status) + " " + S(c.tags);
  if (c.last_reply_at) return true;                                 // they replied → real-lead candidate
  if (/\bqualified\b|\bhot\b|\bwarm\b|appointment|under contract|offer\b/.test(st)) return true;
  if (/\binterested\b/.test(st) && !/not\s*interested/.test(st)) return true;
  return false;
}

/** The delete reasons a contact matches (empty = keep). Opt-out always counts even if protected is
 *  false — but a protected contact is filtered out by the caller before deletion. */
export function cleanReasons(c: DreiContact): CleanReason[] {
  const out: CleanReason[] = [];
  const st = S(c.status), es = S(c.email_status), ps = S(c.phone_status), tags = S(c.tags);
  const any = `${st} ${es} ${ps} ${tags}`;
  if (c.sms_opted_out_at || c.email_opted_out_at || /opted?.?out|unsubscrib|\bstop\b|do.?not.?(contact|email|text)|dnc\b/.test(any)) out.push("opted_out");
  if (/bad contact|bad.?info|invalid|disconnect|wrong number|not in service|no longer/.test(any)) out.push("bad_contact");
  if (/not\s*interested|\bdead\b|\blost\b|not.?a.?fit|unqualified/.test(st + " " + tags)) out.push("not_interested");
  if (/bounc/.test(any)) out.push("email_bounced");
  if (/guess|unverified|low.?confidence|catch.?all|risky|uncertain/.test(es + " " + tags)) out.push("email_guess");
  return out;
}

export type CleanupScan = {
  scanned: number;
  toDelete: Array<{ id: string; name: string; phone: string; email: string; reasons: CleanReason[] }>;
  review: Array<{ id: string; name: string; phone: string; email: string; status: string; why: string }>;
  byReason: Record<CleanReason, number>;
  protectedMatches: number;   // matched a delete reason but is protected → sent to review instead
  statusHistogram: Record<string, number>; // real status values seen (so we can tune the rules)
  sampleKeys: string[];       // every field name the API returned (so we map the right fields)
  sample: Array<Record<string, unknown>>; // a few redacted raw contacts — to tune the rules on real data
};

const redactSample = (c: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (/phone/i.test(k) && typeof v === "string") out[k] = v ? `…${v.replace(/\D/g, "").slice(-4)}` : v;
    else if (/email/i.test(k) && typeof v === "string" && v.includes("@")) out[k] = v.replace(/^[^@]+/, "…");
    else if (typeof v === "object" && v) out[k] = Array.isArray(v) ? v.slice(0, 5) : "{…}";
    else out[k] = v;
  }
  return out;
};

/** Page the whole DirectREI contact list and classify. Read-only. Dedupes by id (so a broken
 *  page param can't inflate the count) and caps pages by the real total. */
export async function scanDirectReiForCleanup(maxPages = 40, limit = 200): Promise<CleanupScan | { error: string }> {
  const toDelete: CleanupScan["toDelete"] = [];
  const review: CleanupScan["review"] = [];
  const byReason: Record<CleanReason, number> = { opted_out: 0, bad_contact: 0, not_interested: 0, email_bounced: 0, email_guess: 0 };
  const statusHistogram: Record<string, number> = {};
  const keys = new Set<string>();
  const sample: Array<Record<string, unknown>> = [];
  const seenIds = new Set<string>();
  let scanned = 0, protectedMatches = 0, total = Infinity;
  for (let page = 0; page < maxPages; page++) {
    const res = await directReiContacts({ page: String(page), limit: String(limit), offset: String(page * limit) });
    if (!res.ok) { if (page === 0) return { error: `contacts ${res.status}: ${JSON.stringify(res.body).slice(0, 160)}` }; break; }
    const body = res.body as { rows?: DreiContact[]; has_more?: boolean; total_count?: number };
    if (typeof body?.total_count === "number") total = body.total_count;
    const rows = body?.rows ?? [];
    if (!rows.length) break;
    let newThisPage = 0;
    for (const c of rows) {
      const id = String(c.id ?? c.contact_id ?? "");
      if (id && seenIds.has(id)) continue; // broken paging returning the same rows → skip dupes
      if (id) seenIds.add(id);
      newThisPage++;
      scanned++;
      if (sample.length < 4) { for (const k of Object.keys(c)) keys.add(k); sample.push(redactSample(c as Record<string, unknown>)); }
      const status = (c.status || "—").trim();
      statusHistogram[status] = (statusHistogram[status] ?? 0) + 1;
      const reasons = cleanReasons(c);
      if (!reasons.length) continue;
      const base = { id, name: c.name || "—", phone: c.phone || "", email: c.email || "" };
      if (isProtected(c)) { protectedMatches++; review.push({ ...base, status, why: reasons.map((r) => REASON_LABEL[r]).join(", ") }); continue; }
      for (const r of reasons) byReason[r]++;
      if (id) toDelete.push({ ...base, reasons });
    }
    if (newThisPage === 0) break;                 // paging returned only dupes → stop
    if (rows.length < limit || scanned >= total) break;
    if (!body?.has_more && total === Infinity) break;
  }
  return { scanned, toDelete, review, byReason, protectedMatches, statusHistogram, sampleKeys: [...keys], sample };
}

/** DirectREI import-template CSV of the delete batch — the backup before anything is removed. */
export function cleanupBackupCsv(rows: CleanupScan["toDelete"]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const header = "Contact ID,Name,Phone,Email,Reasons";
  const body = rows.map((r) => [r.id, r.name, r.phone, r.email, r.reasons.map((x) => REASON_LABEL[x]).join(" | ")].map((v) => esc(String(v))).join(",")).join("\n");
  return `${header}\n${body}\n`;
}
