// Direct REI → War Room feed (Jon 2026-10-04). Classifies every contact to a
// side — SELLER (acquisitions · Michelle) or BUYER (dispo · Marie/Sharyn) —
// and counts new contacts + replies (SMS/email) per day. Replies exclude
// opt-outs ("take me off" texts aren't interest). Jon's rule first: campaign
// name containing seller/buyer; contacts in unlabeled campaigns fall back to
// their role / contact_type fields.
import { db } from "@/lib/db";
import { directReiConfigured, directReiContacts, directReiCampaigns } from "@/lib/directrei";

export const DREI_FEED_CAT = "__directrei_feed__";

export type DreiReply = {
  name: string; campaign: string; channel: string; side: "seller" | "buyer" | "other";
  at: string; needsAttention: boolean; phone: string; email: string;
};
export type DreiSide = { newToday: number; new7d: number; repliesToday: number; replies7d: number; smsRepliesToday: number; smsReplies7d: number; emailRepliesToday?: number; emailReplies7d: number };
export type DreiFeed = {
  at: string;
  newSellersToday?: Array<{ name: string; phone: string; email: string }>;
  totalContacts: number;
  scanned: number;
  smsRepliesToday: number; // all campaigns — feeds the team "Text Responses" KPI
  seller: DreiSide; buyer: DreiSide;
  recentReplies: DreiReply[]; // newest first, max 12
  campaigns: Array<{ name: string; channel: string; side: "seller" | "buyer" | "other"; paused: boolean }>;
};

type Contact = {
  name?: string; campaign_id?: string; role?: string; contact_type?: string; status?: string;
  phone?: string; email?: string; added_date?: string; last_reply_at?: string | null;
  sms_opted_out_at?: string | null; email_opted_out_at?: string | null; needs_attention?: boolean;
};

const BUYER_TYPES = new Set(["buyer", "builder", "flipper", "developer", "investor"]);

function sideOf(campaignName: string, c: Contact): "seller" | "buyer" | "other" {
  if (/seller/i.test(campaignName)) return "seller"; // Jon's rule first
  if (/buyer/i.test(campaignName)) return "buyer";
  if ((c.role ?? "").toLowerCase() === "seller") return "seller";
  if ((c.role ?? "").toLowerCase() === "buyer") return "buyer";
  const t = (c.contact_type ?? "").toLowerCase();
  if (t === "owner") return "seller";
  if (BUYER_TYPES.has(t)) return "buyer";
  return "other";
}

const empty = (): DreiSide => ({ newToday: 0, new7d: 0, repliesToday: 0, replies7d: 0, smsRepliesToday: 0, smsReplies7d: 0, emailRepliesToday: 0, emailReplies7d: 0 });

/** Pull + aggregate (up to ~4,000 contacts/run). Pure read on Direct REI. */
export async function buildDreiFeed(todayYmd: string): Promise<DreiFeed | null> {
  if (!directReiConfigured()) return null;
  const campsRes = await directReiCampaigns();
  const campRows = ((campsRes.body as { rows?: Array<{ id: string; name: string; channel: string; paused: boolean }> })?.rows ?? []);
  const campById = new Map(campRows.map((c) => [c.id, c]));

  const weekAgo = new Date(Date.parse(todayYmd) - 7 * 86400000).toISOString().slice(0, 10);
  const sides = { seller: empty(), buyer: empty(), other: empty() };
  const newSellers: Array<{ name: string; phone: string; email: string }> = [];
  const replies: DreiReply[] = [];
  let total = 0, scanned = 0, smsRepliesToday = 0;

  for (let page = 0; page < 20; page++) {
    const res = await directReiContacts({ limit: "200", offset: String(page * 200) });
    if (!res.ok) break;
    const body = res.body as { total_count?: number; rows?: Contact[]; has_more?: boolean };
    total = body.total_count ?? total;
    const rows = body.rows ?? [];
    for (const c of rows) {
      scanned++;
      const camp = campById.get(String(c.campaign_id ?? ""));
      const side = sideOf(camp?.name ?? "", c);
      const bucket = sides[side];
      const added = (c.added_date ?? "").slice(0, 10);
      if (added === todayYmd) {
        bucket.newToday++;
        if (side === "seller" && newSellers.length < 25) newSellers.push({ name: c.name ?? "Seller lead", phone: c.phone ?? "", email: c.email ?? "" });
      }
      if (added >= weekAgo) bucket.new7d++;
      const optedOut = !!(c.sms_opted_out_at || c.email_opted_out_at);
      const replyDay = (c.last_reply_at ?? "").slice(0, 10);
      if (replyDay && !optedOut) {
        if (replyDay === todayYmd) {
          bucket.repliesToday++;
          if (/sms|text/i.test(camp?.channel ?? "")) { smsRepliesToday++; bucket.smsRepliesToday++; }
          else if (/email/i.test(camp?.channel ?? "")) bucket.emailRepliesToday = (bucket.emailRepliesToday ?? 0) + 1;
        }
        if (replyDay >= weekAgo) {
          bucket.replies7d++;
          const ch = camp?.channel ?? "";
          if (/sms|text|call/i.test(ch)) bucket.smsReplies7d++;
          else if (/email/i.test(ch)) bucket.emailReplies7d++;
          replies.push({
            name: c.name ?? "—", campaign: camp?.name ?? "(no campaign)", channel: camp?.channel ?? "",
            side, at: c.last_reply_at!, needsAttention: !!c.needs_attention, phone: c.phone ?? "", email: c.email ?? "",
          });
        }
      }
    }
    if (!body.has_more || rows.length === 0) break;
  }

  return {
    at: new Date().toISOString(),
    newSellersToday: newSellers,
    totalContacts: total,
    scanned,
    smsRepliesToday,
    seller: sides.seller,
    buyer: sides.buyer,
    recentReplies: replies.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12),
    campaigns: campRows.map((c) => ({ name: c.name, channel: c.channel, paused: c.paused, side: /seller/i.test(c.name) ? "seller" as const : /buyer/i.test(c.name) ? "buyer" as const : "other" as const })),
  };
}

export async function readDreiFeed(): Promise<DreiFeed | null> {
  const row = await db.resource.findFirst({ where: { category: DREI_FEED_CAT } }).catch(() => null);
  try { return row ? (JSON.parse(row.description) as DreiFeed) : null; } catch { return null; }
}

/** Refresh the cached feed (called from the crmtoday cron 5×/day + the card's refresh button). */
export async function refreshDreiFeed(todayYmd: string): Promise<DreiFeed | null> {
  const feed = await buildDreiFeed(todayYmd);
  if (!feed) return null;
  const description = JSON.stringify(feed);
  const row = await db.resource.findFirst({ where: { category: DREI_FEED_CAT } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "directrei-feed", category: DREI_FEED_CAT, url: "", description } });

  // Machine-fed team KPIs (Jon 2026-10-04): Seller/Buyer SMS replies from
  // Direct REI text campaigns. Manual entries for a day always win — we only
  // ever touch rows we created (enteredBy "crm").
  const feedTeamKpi2 = async (keys: string[], name: string, value: number) => {
    const kpi = await db.kpi.findFirst({ where: { OR: [{ key: { in: keys } }, { name }] }, select: { id: true } });
    if (!kpi) return;
    const existing = await db.entry.findFirst({ where: { kpiId: kpi.id, userId: null, date: todayYmd } });
    if (existing) { if (existing.enteredBy === "crm") await db.entry.update({ where: { id: existing.id }, data: { value } }); }
    else if (value > 0) await db.entry.create({ data: { kpiId: kpi.id, userId: null, date: todayYmd, value, enteredBy: "crm" } });
  };
  try {
    // Jon 2026-10-07: the four Marketing-responses tiles all auto-pull from
    // Direct REI. Resolve by key OR display name so renamed KPI rows still bind.
    await feedTeamKpi2(["seller_sms_replies", "text_responses"], "Seller SMS Replies", feed.seller.smsRepliesToday);
    await feedTeamKpi2(["buyer_sms_replies"], "Buyer SMS Replies", feed.buyer.smsRepliesToday);
    await feedTeamKpi2(["seller_email_replies"], "Seller Email Replies", feed.seller.emailRepliesToday ?? 0);
    await feedTeamKpi2(["buyer_email_replies"], "Buyer Email Replies", feed.buyer.emailRepliesToday ?? 0);
  } catch { /* KPI feed is additive */ }

  // 🤖 Replied-seller automation (Jon 2026-10-08, replacing the 10-07 version):
  // Direct REI already texts/emails/calls every NEW lead for us — walking all
  // of them into the CRM buried Michelle under 50 "first call" tasks in a day.
  // Now only sellers who actually REPLY become CRM leads (they're warm), with
  // a call-now task. Dedupe by phone/name.
  try {
    const { logCrmEvent } = await import("@/lib/crm");
    const reps = await db.user.findMany({ where: { active: true, position: { in: ["acquisitions", "cc_lm"] } }, select: { name: true } });
    const replied = (feed.recentReplies ?? []).filter((r) => r.side === "seller" && (r.at ?? "").slice(0, 10) === todayYmd);
    if (reps.length && replied.length) {
      const counts = await Promise.all(reps.map((r) => db.crmOpportunity.count({ where: { assignedTo: r.name, archivedAt: null } })));
      for (const lead of replied) {
        const last10 = (lead.phone ?? "").replace(/\D/g, "").slice(-10);
        const dup = await db.crmContact.findFirst({ where: { OR: [...(last10.length === 10 ? [{ phone: { contains: last10 } }] : []), { name: { equals: lead.name, mode: "insensitive" as const } }] }, select: { id: true } });
        if (dup) continue;
        const i = counts.indexOf(Math.min(...counts));
        counts[i]++;
        const rep = reps[i].name;
        const contact = await db.crmContact.create({ data: { name: lead.name, phone: lead.phone ?? "", email: lead.email ?? "", source: "Direct REI (replied)", assignedTo: rep } });
        const opp = await db.crmOpportunity.create({ data: { contactId: contact.id, title: `${lead.name} — Direct REI seller REPLIED`, stage: "new", assignedTo: rep, nextFollowUp: todayYmd } });
        await db.crmTask.create({ data: { contactId: contact.id, oppId: opp.id, title: "📞 Call now — Direct REI seller REPLIED (warm)", due: todayYmd, assignedTo: rep, createdBy: "automation" } });
        await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: `Auto-created from Direct REI (seller replied to campaign) · assigned ${rep}`, actor: "automation" });
      }
    }
  } catch { /* lead automation never breaks the feed */ }
  return feed;
}
