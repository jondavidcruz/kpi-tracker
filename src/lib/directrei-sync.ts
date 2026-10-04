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
export type DreiSide = { newToday: number; new7d: number; repliesToday: number; replies7d: number; smsReplies7d: number; emailReplies7d: number };
export type DreiFeed = {
  at: string;
  totalContacts: number;
  scanned: number;
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

const empty = (): DreiSide => ({ newToday: 0, new7d: 0, repliesToday: 0, replies7d: 0, smsReplies7d: 0, emailReplies7d: 0 });

/** Pull + aggregate (up to ~4,000 contacts/run). Pure read on Direct REI. */
export async function buildDreiFeed(todayYmd: string): Promise<DreiFeed | null> {
  if (!directReiConfigured()) return null;
  const campsRes = await directReiCampaigns();
  const campRows = ((campsRes.body as { rows?: Array<{ id: string; name: string; channel: string; paused: boolean }> })?.rows ?? []);
  const campById = new Map(campRows.map((c) => [c.id, c]));

  const weekAgo = new Date(Date.parse(todayYmd) - 7 * 86400000).toISOString().slice(0, 10);
  const sides = { seller: empty(), buyer: empty(), other: empty() };
  const replies: DreiReply[] = [];
  let total = 0, scanned = 0;

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
      if (added === todayYmd) bucket.newToday++;
      if (added >= weekAgo) bucket.new7d++;
      const optedOut = !!(c.sms_opted_out_at || c.email_opted_out_at);
      const replyDay = (c.last_reply_at ?? "").slice(0, 10);
      if (replyDay && !optedOut) {
        if (replyDay === todayYmd) bucket.repliesToday++;
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
    totalContacts: total,
    scanned,
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
  return feed;
}
