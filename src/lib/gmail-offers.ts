import { db } from "@/lib/db";
import { addrMatch, normAddr } from "@/lib/underwrite-history";

// 📬 Offer capture (Jon 2026-10-08, unlocked by enabling the Gmail API):
// buyers email their numbers to the dispo inboxes — this scans recent mail,
// finds $ amounts, matches them to the deal by address, and racks the offers
// on the opportunity so dispo can rack & stack without copy-paste.

async function gmailToken(asUser: string): Promise<string> {
  const crypto = await import("crypto");
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: "RS256", typ: "JWT" });
  const claims = enc({ iss: sa.client_email, sub: asUser, scope: "https://www.googleapis.com/auth/gmail.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${head}.${claims}`); signer.end();
  const sig = signer.sign(sa.private_key).toString("base64url");
  const tok = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }) }).then((r) => r.json());
  if (!tok.access_token) throw new Error(JSON.stringify(tok).slice(0, 200));
  return tok.access_token as string;
}

export type CapturedOffer = { at: string; from: string; amount: number; subject: string; mailbox: string; msgId: string };

const SEEN_CAT = "__offer_scan_seen__";

export async function scanOffers(mailboxes: string[]): Promise<{ scanned: number; offers: Array<CapturedOffer & { opp: string }>; mailboxErrors: Record<string, string> }> {
  const seenRow = await db.resource.findFirst({ where: { category: SEEN_CAT } });
  let seen: string[] = [];
  try { seen = seenRow?.description ? JSON.parse(seenRow.description) : []; } catch { seen = []; }
  const seenSet = new Set(seen);

  // candidate deals: live opportunities in the dispo pipelines with an address
  const opps = await db.crmOpportunity.findMany({
    where: { archivedAt: null, pipeline: { contains: "DS:" } },
    select: { id: true, title: true, contactId: true, assignedTo: true, formData: true, contact: { select: { address: true, name: true } } },
  });
  const candidates = opps
    .map((o) => ({ ...o, addr: o.contact.address || o.title }))
    .filter((o) => /\d/.test(o.addr));

  const { logCrmEvent } = await import("@/lib/crm");
  const results: Array<CapturedOffer & { opp: string }> = [];
  const mailboxErrors: Record<string, string> = {};
  let scanned = 0;

  for (const mb of mailboxes) {
    try {
      const token = await gmailToken(mb);
      const H = { Authorization: `Bearer ${token}` };
      const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent("newer_than:2d in:inbox -category:promotions")}&maxResults=25`, { headers: H }).then((r) => r.json());
      for (const m of (list.messages ?? []) as Array<{ id: string }>) {
        if (seenSet.has(m.id)) continue;
        seenSet.add(m.id);
        const msg = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, { headers: H }).then((r) => r.json());
        scanned++;
        const headers = ((msg.payload?.headers ?? []) as Array<{ name: string; value: string }>);
        const from = headers.find((h) => h.name === "From")?.value ?? "";
        const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
        const text = `${subject} ${msg.snippet ?? ""}`;
        // skip our own outbound + newsletters without numbers
        if (/freedom-offers\.com/i.test(from)) continue;
        const amounts = [...text.matchAll(/\$\s?([\d][\d,]{3,})(?:\.\d\d)?\b/g)]
          .map((x) => Number(x[1].replace(/,/g, "")))
          .filter((n) => n >= 1000 && n <= 50_000_000);
        if (!amounts.length) continue;
        const tl = normAddr(text);
        const hit = candidates.find((o) => addrMatch(o.addr, text) || (normAddr(o.addr) && tl.includes(normAddr(o.addr).split(" ").slice(0, 2).join(" "))));
        if (!hit) continue;
        const amount = Math.max(...amounts);
        const offer: CapturedOffer = { at: new Date().toISOString(), from: from.slice(0, 120), amount, subject: subject.slice(0, 160), mailbox: mb, msgId: m.id };
        const fd = (hit.formData ?? {}) as Record<string, unknown>;
        const offers = Array.isArray(fd.__offers) ? (fd.__offers as CapturedOffer[]) : [];
        offers.unshift(offer);
        await db.crmOpportunity.update({ where: { id: hit.id }, data: { formData: { ...fd, __offers: offers.slice(0, 30) } } });
        await logCrmEvent({ contactId: hit.contactId, oppId: hit.id, kind: "system", body: `💵 OFFER captured from email: $${amount.toLocaleString()} — ${from} ("${subject.slice(0, 80)}")`, actor: "offer-scan" }).catch(() => {});
        await db.crmTask.create({ data: { oppId: hit.id, contactId: hit.contactId, title: `💵 New buyer offer $${amount.toLocaleString()} on ${hit.addr.slice(0, 60)} — rack & stack`, due: new Date().toISOString().slice(0, 10), assignedTo: hit.assignedTo || "", createdBy: "offer-scan" } }).catch(() => {});
        // stamp the buyer's record too (vetted buyers by sender email)
        const email = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
        if (email.includes("@")) {
          const buyer = await db.marketContact.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, outreachLog: true } });
          if (buyer) await db.marketContact.update({ where: { id: buyer.id }, data: { outreachLog: `${new Date().toISOString().slice(0, 10)} — emailed offer $${amount.toLocaleString()} on ${hit.addr.slice(0, 50)}\n${buyer.outreachLog}`.slice(0, 4000), lastContacted: new Date().toISOString().slice(0, 10) } });
        }
        results.push({ ...offer, opp: hit.addr });
        const { postToSpace } = await import("@/lib/chat-spaces");
        postToSpace("acquisitions", `💵 Buyer offer captured from email: $${amount.toLocaleString()} on ${hit.addr.slice(0, 60)} (${from.slice(0, 60)}) — racked on the lead, dispo task created`).catch(() => {});
      }
    } catch (e) { mailboxErrors[mb] = String(e).slice(0, 150); }
  }

  const desc = JSON.stringify([...seenSet].slice(-800));
  if (seenRow) await db.resource.update({ where: { id: seenRow.id }, data: { description: desc } });
  else await db.resource.create({ data: { title: "offer-scan-seen", category: SEEN_CAT, url: "", description: desc } });
  return { scanned, offers: results, mailboxErrors };
}
