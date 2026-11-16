// Direct REI → War Room feed (Jon 2026-10-04). Classifies every contact to a
// side — SELLER (acquisitions · Michelle) or BUYER (dispo · Marie/Sharyn) —
// and counts new contacts + replies (SMS/email) per day. Replies exclude
// opt-outs ("take me off" texts aren't interest). Jon's rule first: campaign
// name containing seller/buyer; contacts in unlabeled campaigns fall back to
// their role / contact_type fields.
import { db } from "@/lib/db";
import { directReiConfigured, directReiContacts, directReiCampaigns, directReiCampaignPerf } from "@/lib/directrei";
import { upsertDreiHotLead } from "@/lib/directrei-leads";

// 🟢 Owner-flippable auto-card switch (Jon 2026-11-14). Replaces the dead
// DIRECTREI_LEADS env flag that silently stayed OFF after the 10-24 pause, so
// interested repliers never became CRM cards. Default ON; owner sets the
// Resource "__directrei_autocard__" description to "off" to kill it from inside
// the app (no Vercel access needed). Env DIRECTREI_LEADS="on" still force-enables.
const DREI_AUTOCARD_CAT = "__directrei_autocard__";
async function dreiAutoCardOn(): Promise<boolean> {
  // 🛑 DELETED (Jon 2026-11-16): auto-importing Direct REI repliers into the War
  // Room is OFF for good. Jon never pulled house sellers, the carded leads had no
  // real texts attached, and he'd rather the team upload a lead by hand only when
  // it's a genuine seller. Hard-disabled here so no env/Resource toggle can turn it
  // back on. To restore, delete this line and the block below works as before.
  return false;
  // --- former behaviour (kept for reference) ---
  // if (process.env.DIRECTREI_LEADS === "on") return true;
  // const row = await db.resource.findFirst({ where: { category: DREI_AUTOCARD_CAT }, select: { description: true } }).catch(() => null);
  // return (row?.description ?? "on").trim().toLowerCase() !== "off"; // default ON
}

export const DREI_FEED_CAT = "__directrei_feed__";

export type DreiReply = {
  name: string; campaign: string; channel: string; side: "seller" | "buyer" | "other";
  at: string; needsAttention: boolean; phone: string; email: string; address?: string;
};
export type DreiSide = { newToday: number; new7d: number; repliesToday: number; replies7d: number; smsRepliesToday: number; smsReplies7d: number; emailRepliesToday?: number; emailReplies7d: number };
// 📊 Per-campaign response health (Jon 2026-11-12: Market Finder should show, per uploaded list,
// who replied / is interested / gave a price / not-interested / opted-out — pulled from Direct REI
// 5×/day, keyed by a NORMALIZED campaign name so it matches our uploaded pull-list names.
export type DreiCampaignHealth = { name: string; sent: number; replied: number; interested: number; priced: number; notInterested: number; optedOut: number };
// Normalize a campaign / pull-list name so "Gulf_County_FL_..._DM_DREI_READY_2" matches the Direct
// REI campaign name regardless of the DM/DREI/date/Final/Ready suffixes.
export function normCampaignName(s: string): string {
  return (s || "").toLowerCase()
    .replace(/\.csv$/i, "")
    .replace(/\b(dm|drei|final|ready|vacant|land|tax|delinquent|owners?|list|pull|war ?room|\d{4}-\d{2}-\d{2}|\d{4}|50k|\d+)\b/g, " ")
    .replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
}
export type DreiFeed = {
  at: string;
  newSellersToday?: Array<{ name: string; phone: string; email: string }>;
  totalContacts: number;
  scanned: number;
  smsRepliesToday: number; // all campaigns — feeds the team "Text Responses" KPI
  seller: DreiSide; buyer: DreiSide;
  recentReplies: DreiReply[]; // newest first, max 12
  interestedLeads?: Array<{ name: string; phone: string; email: string; address: string; market: string; status: string }>; // interested/priced seller repliers to auto-card — stripped before persist
  campaignHealth?: DreiCampaignHealth[]; // per-campaign response tally (keyed by normCampaignName)
  campaignInterested?: Record<string, Array<{ name: string; phone: string; address: string; status: string; at: string }>>; // interested/priced repliers BY campaign (normCampaignName key) — who Michelle should offer
  campaigns: Array<{ name: string; channel: string; side: "seller" | "buyer" | "other"; paused: boolean }>;
};

type Contact = {
  name?: string; campaign_id?: string; role?: string; contact_type?: string; status?: string;
  phone?: string; email?: string; added_date?: string; last_reply_at?: string | null;
  sms_opted_out_at?: string | null; email_opted_out_at?: string | null; needs_attention?: boolean;
  // Direct REI stores the address as mailing_* (confirmed via ?dreicontactprobe=1,
  // 2026-10-16). Jon: "no addresses on Direct REI leads" — they were never read.
  mailing_street?: string; mailing_city?: string; mailing_state?: string; mailing_zip?: string;
};

/** Build a "street, City, ST zip" address from a Direct REI contact's mailing
 *  fields. Empty string if it has none. */
export function dreiAddress(c: Contact): string {
  const parts = [c.mailing_street, c.mailing_city, c.mailing_state, c.mailing_zip].map((x) => (x || "").trim()).filter(Boolean);
  return parts.join(", ").slice(0, 250);
}

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
  // 🎯 Auto-card window (Jon 2026-11-14): capture every INTERESTED/PRICED seller
  // replier from the last 14 days — not just today's 12 — so nothing warm slips.
  const cardWindow = new Date(Date.parse(todayYmd) - 14 * 86400000).toISOString().slice(0, 10);
  const interestedLeads: Array<{ name: string; phone: string; email: string; address: string; market: string; status: string }> = [];
  const sides = { seller: empty(), buyer: empty(), other: empty() };
  const newSellers: Array<{ name: string; phone: string; email: string }> = [];
  const replies: DreiReply[] = [];
  const health: Record<string, DreiCampaignHealth> = {}; // per-campaign response tally (all-time)
  const interestedByCamp: Record<string, Array<{ name: string; phone: string; address: string; status: string; at: string }>> = {}; // WHO replied interested/priced, per campaign → shown on the /markets campaign so Michelle knows who to offer
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
      // 📊 Campaign Health tally — every response classified by Direct REI status (all-time), keyed
      // by normalized campaign name so Market Finder can match it to each uploaded pull list.
      if (camp?.name) {
        const key = normCampaignName(camp.name);
        const h = (health[key] ??= { name: camp.name, sent: 0, replied: 0, interested: 0, priced: 0, notInterested: 0, optedOut: 0 });
        const st = (c.status || "").toLowerCase();
        if (optedOut || /\bopt|unsub|\bstop\b|\bdnc\b/.test(st)) h.optedOut++;
        else if (replyDay || /replied|interest|price|offer|qualif|hot|warm|not.?interest/.test(st)) {
          h.replied++;
          const priced = /\$|price|offer|asking|would take/.test(st);
          const interested = /interest|qualif|hot|warm|ready|\byes\b/.test(st);
          if (priced) { h.priced++; h.interested++; }
          else if (/not.?interest|dead|wrong|disqualif/.test(st)) h.notInterested++;
          else if (interested) h.interested++;
          // 🎯 Keep the actual interested/priced repliers (not just a count) so each /markets campaign
          // can list exactly WHO to offer. Capped per campaign; most recent kept at build end.
          if ((priced || interested || c.needs_attention) && !/not.?interest|dead|wrong|disqualif/.test(st)) {
            (interestedByCamp[key] ??= []).push({ name: c.name ?? "—", phone: c.phone ?? "", address: dreiAddress(c), status: c.status ?? (priced ? "priced" : "interested"), at: c.last_reply_at ?? "" });
          }
        }
      }
      if (replyDay && !optedOut) {
        // 🎯 Auto-card ONLY interested/priced seller replies (Jon 2026-11-14 choice).
        // Direct REI's /contacts API exposes no reply TEXT — only `status` + `needs_attention` —
        // so "interested/priced" is read from those: a priced/asking/interested status, OR a
        // reply Direct REI flagged for human attention (a real inbound that its status engine
        // didn't auto-classify — exactly the ones that were slipping). Explicit not-interested
        // is excluded. The dedup/idempotency lives in upsertDreiHotLead.
        const stC = (c.status || "").toLowerCase();
        const notInterested = /not.?interest|dead|wrong|disqualif|dnc|unsub|\bstop\b|\bopt/.test(stC);
        const pricedOrInterested = /\$|price|offer|asking|would take|interest|qualif|hot|warm|ready|\byes\b/.test(stC);
        if (side === "seller" && replyDay >= cardWindow && !notInterested && (pricedOrInterested || c.needs_attention) && interestedLeads.length < 150) {
          interestedLeads.push({ name: c.name ?? "", phone: c.phone ?? "", email: c.email ?? "", address: dreiAddress(c), market: (c.mailing_state ?? "").trim(), status: c.status ?? "" });
        }
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
            side, at: c.last_reply_at!, needsAttention: !!c.needs_attention, phone: c.phone ?? "", email: c.email ?? "", address: dreiAddress(c),
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
    interestedLeads,
    campaignHealth: await (async () => {
      // 📊 Merge Direct REI's NATIVE per-campaign stats (/campaigns: sent + replied) — the
      // authoritative "how many texts/replies per campaign" — over the contact-status tally.
      try {
        const perf = await directReiCampaignPerf();
        if ("rows" in perf) for (const p of perf.rows) {
          const key = normCampaignName(p.name);
          const h = (health[key] ??= { name: p.name, sent: 0, replied: 0, interested: 0, priced: 0, notInterested: 0, optedOut: 0 });
          if (typeof p.sent === "number") h.sent = p.sent;
          if (typeof p.replied === "number") h.replied = Math.max(h.replied, p.replied); // native reply count wins
          if (typeof p.optedOut === "number") h.optedOut = Math.max(h.optedOut, p.optedOut);
        }
      } catch { /* native stats optional — contact-status tally still shows */ }
      return Object.values(health).filter((h) => h.sent || h.replied || h.optedOut);
    })(),
    campaignInterested: Object.fromEntries(
      Object.entries(interestedByCamp).map(([k, list]) => [k, list.sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 15)]),
    ),
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
  // Pull the auto-card list off the feed and DON'T persist it (keeps the cached
  // feed JSON lean — it's only needed for this run's carding below).
  const interestedLeads = feed.interestedLeads ?? [];
  delete feed.interestedLeads;
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

  // 🤖 Replied-seller auto-card (Jon 2026-11-14, rebuilt): card ONLY interested/
  // priced seller replies — captured across the last 14 days in the loop above,
  // not just "today's 12" — so warm repliers stop slipping. Routing, dedup,
  // Michelle-pipeline placement, the HOT call task and the note all live in the
  // shared upsertDreiHotLead (same path the webhook uses → the two converge
  // idempotently). On/off is the owner-flippable __directrei_autocard__ flag
  // (default ON), NOT the stale DIRECTREI_LEADS env var that stayed off.
  try {
    if (interestedLeads.length && await dreiAutoCardOn()) {
      let carded = 0;
      for (const lead of interestedLeads) {
        const r = await upsertDreiHotLead({
          name: lead.name, phone: lead.phone, email: lead.email, address: lead.address,
          market: lead.market, status: lead.status,
          notes: `Interested/priced reply via Direct REI${lead.status ? ` (status: ${lead.status})` : ""}`,
        }).catch(() => null);
        if (r?.created) carded++;
      }
      if (carded) console.log(`[directrei-sync] auto-carded ${carded} interested/priced seller repliers (of ${interestedLeads.length} in window)`);
    }
  } catch { /* lead automation never breaks the feed */ }
  return feed;
}
