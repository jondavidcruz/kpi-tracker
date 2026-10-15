import { db } from "@/lib/db";
import { gmailToken } from "@/lib/gmail-offers";

// 🧾 Receipts scanner (Jon 2026-10-08 backlog #4): once a day, read info@ via
// the Gmail DWD helper, pick out subscription receipts / invoices / payment
// confirmations, and post ONE summary (vendor · amount · subject · open-link)
// to the "receipts" Chat room so bookkeeping never hunts through the inbox.
// Read-only on Gmail; dedupes by message id; keeps a rolling log in a
// Resource row (__receipts_log__) for a future /expenses import. No schema.

export type Receipt = {
  at: string;       // ISO scanned-at
  date: string;     // email Date header (as given)
  vendor: string;
  amount: number | null;
  subject: string;
  link: string;     // Gmail deep link
  mailbox: string;
  pdf: boolean;     // a PDF attachment is on the email
  msgId: string;
};

const SEEN_CAT = "__receipt_scan_seen__";
const LOG_CAT = "__receipts_log__";

// Vendors whose mail is a receipt even when the subject is vague ("Your Telnyx statement").
const VENDOR_RX = /(stripe|paypal|telnyx|twilio|vercel|anthropic|openai|apple\.com|resend|postking|directrei|dealmachine|gohighlevel|leadconnector|propstream|batchdialer|batchleads|regrid|rentcast|zoom\.us|pandadoc|supabase|github|canva|godaddy|namecheap|dropbox|adobe|notion|slack|intuit|quickbooks|payments-noreply@google|workspace-noreply@google|aws|amazon|ispeedtolead|dealspeed|investorlift|launchcontrol|calendly|squarespace|wix|mailchimp|docusign)/i;
// Subject words that mean "money changed hands".
const RECEIPT_RX = /\b(receipt|invoice|payment (?:received|confirmation|successful|succeeded|processed|complete)|your (?:payment|order|purchase|subscription|renewal|bill|statement)|order confirmation|has been (?:charged|renewed|paid|processed)|billing statement|statement (?:is )?(?:ready|available)|thanks? (?:you )?for your (?:payment|purchase|order)|auto-?renew(?:al|ed)?|renewal|was charged|charged \$|paid \$|amount due|tax invoice)\b/i;
// Marketing noise that uses the same words.
const NEG_RX = /(webinar|% ?off|sale ends|limited time|promo code|flash sale|coupon|black friday|last chance|special offer|free trial)/i;

function b64url(s: string): string {
  try { return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); } catch { return ""; }
}

type Part = { mimeType?: string; filename?: string; body?: { data?: string; size?: number }; parts?: Part[] };

/** Walk the MIME tree: plain text (fallback: stripped HTML) + attachment filenames. */
function walk(p: Part | undefined, acc: { text: string; html: string; files: string[] }) {
  if (!p) return;
  if (p.filename) acc.files.push(p.filename);
  const data = p.body?.data;
  if (data && p.mimeType === "text/plain" && acc.text.length < 20_000) acc.text += b64url(data) + "\n";
  else if (data && p.mimeType === "text/html" && acc.html.length < 40_000) acc.html += b64url(data);
  for (const c of p.parts ?? []) walk(c, acc);
}

function stripHtml(h: string): string {
  return h.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

/** Largest $ amount in the text (receipts print subtotal/tax/total; total is the max). */
function pickAmount(text: string): number | null {
  const found = [...text.matchAll(/(?:\$|USD\s?)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?\b/g)]
    .map((m) => Number(m[1].replace(/,/g, "")) + (m[2] ? Number(m[2]) / 100 : 0))
    .filter((n) => n > 0 && n < 100_000);
  return found.length ? Math.max(...found) : null;
}

function vendorOf(from: string): string {
  const name = from.replace(/<[^>]+>/, "").replace(/"/g, "").trim();
  if (name && !name.includes("@")) return name.slice(0, 40);
  const dom = (from.match(/@([\w.-]+)/)?.[1] ?? "").replace(/^(mail|email|billing|noreply|no-reply|notifications?)\./, "");
  return (dom || from).slice(0, 40);
}

export async function scanReceipts(opts: { mailboxes?: string[]; days?: number; post?: boolean; max?: number } = {}): Promise<{
  scanned: number; receipts: Receipt[]; posted: boolean; mailboxErrors: Record<string, string>;
}> {
  const mailboxes = opts.mailboxes?.length ? opts.mailboxes : ["info@freedom-offers.com"];
  const days = Math.min(30, Math.max(1, opts.days ?? 2));
  const max = Math.min(60, Math.max(5, opts.max ?? 30));
  const post = opts.post !== false;

  const seenRow = await db.resource.findFirst({ where: { category: SEEN_CAT } });
  let seen: string[] = [];
  try { seen = seenRow?.description ? JSON.parse(seenRow.description) : []; } catch { seen = []; }
  const seenSet = new Set(seen);

  const receipts: Receipt[] = [];
  const mailboxErrors: Record<string, string> = {};
  let scanned = 0;
  const q = `newer_than:${days}d -from:freedom-offers.com -category:promotions -category:social (receipt OR invoice OR payment OR "order confirmation" OR subscription OR renewal OR billing OR statement OR charged)`;

  for (const mb of mailboxes) {
    try {
      const token = await gmailToken(mb);
      const H = { Authorization: `Bearer ${token}` };
      const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${max}`, { headers: H }).then((r) => r.json());
      for (const m of (list.messages ?? []) as Array<{ id: string; threadId?: string }>) {
        if (seenSet.has(m.id)) continue;
        const msg = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, { headers: H }).then((r) => r.json());
        scanned++;
        const headers = ((msg.payload?.headers ?? []) as Array<{ name: string; value: string }>);
        const hdr = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
        const from = hdr("From"); const subject = hdr("Subject"); const date = hdr("Date");
        const acc = { text: "", html: "", files: [] as string[] };
        walk(msg.payload as Part, acc);
        const body = (acc.text || stripHtml(acc.html)).slice(0, 20_000);
        const pdf = acc.files.some((f) => /\.pdf$/i.test(f));
        const vendorHit = VENDOR_RX.test(from);
        const subjectHit = RECEIPT_RX.test(subject);
        if (NEG_RX.test(subject)) { seenSet.add(m.id); continue; }
        if (!vendorHit && !subjectHit) { seenSet.add(m.id); continue; }
        const amount = pickAmount(`${subject}\n${body}`);
        // A receipt has money on it: either a $ amount or an attached PDF.
        if (amount == null && !pdf) { seenSet.add(m.id); continue; }
        seenSet.add(m.id);
        receipts.push({
          at: new Date().toISOString(), date: date.slice(0, 40), vendor: vendorOf(from), amount,
          subject: subject.slice(0, 120), link: `https://mail.google.com/mail/u/0/#all/${m.threadId ?? m.id}`,
          mailbox: mb, pdf, msgId: m.id,
        });
      }
    } catch (e) { mailboxErrors[mb] = String(e).slice(0, 150); }
  }

  // Persist seen ids (rolling) + the receipts log (rolling, newest first).
  const desc = JSON.stringify([...seenSet].slice(-1200));
  if (seenRow) await db.resource.update({ where: { id: seenRow.id }, data: { description: desc } });
  else await db.resource.create({ data: { title: "receipt-scan-seen", category: SEEN_CAT, url: "", description: desc } });

  if (receipts.length) {
    const logRow = await db.resource.findFirst({ where: { category: LOG_CAT } });
    let log: Receipt[] = [];
    try { log = logRow?.description ? JSON.parse(logRow.description) : []; } catch { log = []; }
    const merged = [...receipts, ...log].slice(0, 400);
    const ld = JSON.stringify(merged);
    if (logRow) await db.resource.update({ where: { id: logRow.id }, data: { description: ld } });
    else await db.resource.create({ data: { title: "receipts-log", category: LOG_CAT, url: "", description: ld } });
  }

  let posted = false;
  if (post && receipts.length) {
    const { postToSpace } = await import("@/lib/chat-spaces");
    const day = new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10);
    const total = receipts.reduce((s, r) => s + (r.amount ?? 0), 0);
    const lines = receipts.map((r) => `• *${r.vendor}* — ${r.amount != null ? `$${r.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "amount not found"}${r.pdf ? " 📎 PDF" : ""} — ${r.subject} — <${r.link}|open>`);
    posted = await postToSpace("receipts", `🧾 *Receipts — ${day}* (${receipts.length}${total ? ` · $${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : ""})\n${lines.join("\n")}`);
  }
  return { scanned, receipts, posted, mailboxErrors };
}
