import { db } from "./db";
import { getSettings } from "./data";
import { orgToday } from "./research-kpis";

// Freedom Offers public site — used in every intro. Edit here if the URL changes.
export const FO_WEBSITE = "https://freedom-offers.com";

// Builder/developer buyer types we prospect (vs flippers/cash buyers/agents).
const DEV_TYPES = ["developer", "custom", "remodeler", "builder"];

type DraftRow = { channel: string; toAddress: string; subject: string; body: string };

/** First LinkedIn URL found in a contact's freeform links field, if any. */
function firstLinkedIn(links: string): string {
  const hit = (links || "").split(/[\s,\n]+/).find((u) => /linkedin\.com/i.test(u));
  return hit ? hit.trim() : "";
}

function emailDraft(c: { name: string; company: string; buyBoxAreas: string; market: string }): { subject: string; body: string } {
  const who = c.company || c.name || "your team";
  const area = ((c.buyBoxAreas || c.market || "San Diego").split(/[,\n]/)[0] || "San Diego").trim();
  const subject = `Off-market deals for ${who} in ${area}`;
  const body = [
    `Hi ${c.name || "there"},`,
    ``,
    `I'm with Freedom Offers — a San Diego acquisitions team that puts off-market, development-ready properties under contract (lots, teardowns, value-add). We're expanding our buyer list and ${who} stood out as an active builder/developer in ${area}.`,
    ``,
    `If it's a fit, we'd love to send you deals matched to what you're looking for. Could you reply with your buy box?`,
    `  • Target areas / ZIPs`,
    `  • Property types (lots, teardowns, SFR, multi)`,
    `  • Price range + max lot / finished size`,
    `  • Project type (flip, ground-up build, hold)`,
    ``,
    `A bit more about us: ${FO_WEBSITE}`,
    ``,
    `Thanks,`,
    `The Freedom Offers Team`,
    ``,
    `(Not a fit? Reply STOP and we won't reach out again.)`,
  ].join("\n");
  return { subject, body };
}

function linkedInDraft(c: { name: string; company: string }): { subject: string; body: string } {
  const who = c.company || c.name || "your team";
  return {
    subject: "LinkedIn connect + intro",
    body: `Hi ${c.name || "there"} — I run acquisitions at Freedom Offers (San Diego). We put off-market lots & teardowns under contract and I'd love to send ${who} deals that fit your buy box. Mind if I send a couple? More: ${FO_WEBSITE}`,
  };
}

/**
 * Draft intro outreach for developer-type buyers in Buyer Research that are still
 * "to contact" and don't already have a draft queued. One email draft (if we have an
 * email) + one LinkedIn draft (if we found a profile). Returns how many contacts drafted.
 */
export async function generateOutreachDrafts(limit = 25): Promise<number> {
  const settings = await getSettings();
  const today = orgToday(settings.orgTimezone);
  const devs = await db.marketContact.findMany({
    where: { vetStatus: "to_contact", OR: [{ type: { in: DEV_TYPES } }, { category: "luxury" }] },
    orderBy: { sortOrder: "asc" },
    take: 200,
  });
  if (devs.length === 0) return 0;
  const existing = await db.outreachDraft.findMany({
    where: { contactId: { in: devs.map((d) => d.id) }, status: { in: ["draft", "approved", "sent"] } },
    select: { contactId: true },
  });
  const has = new Set(existing.map((e) => e.contactId));

  let made = 0;
  for (const c of devs) {
    if (made >= limit) break;
    if (has.has(c.id)) continue;
    const rows: DraftRow[] = [];
    if (c.email) {
      const e = emailDraft(c);
      rows.push({ channel: "email", toAddress: c.email, subject: e.subject, body: e.body });
    }
    const li = firstLinkedIn(c.links);
    if (li) {
      const l = linkedInDraft(c);
      rows.push({ channel: "linkedin", toAddress: li, subject: l.subject, body: l.body });
    }
    if (rows.length === 0) continue;
    for (const r of rows) {
      await db.outreachDraft.create({
        data: { contactId: c.id, contactName: c.name, company: c.company, createdOn: today, ...r },
      });
    }
    made += 1;
  }
  return made;
}
