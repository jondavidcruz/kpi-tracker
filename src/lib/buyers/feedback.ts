// Phase 7 (BUILD_SPEC_2): the buyer feedback loop. Every deal send and its
// outcome lands in DealSend; from those we compute each buyer's track record
// (sends / offers / closes / avg offer %) and the behavior flags:
//   lowballer   = ≥3 offers AND avg offer < 70% of our floor
//   tire-kicker = ≥5 sends AND 0 offers AND 0 passes-with-a-reason
// Flags are cached on MarketContact.buyerFlags through updateBuyer, so every
// recompute leaves a BuyerHistory row (rule zero: history on every write).
import { db } from "@/lib/db";
import { updateBuyer } from "@/lib/buyers/write";

export type BuyerFlags = {
  lowballer: boolean;
  tireKicker: boolean;
  blacklisted: boolean;
  blacklistReason: string;
  sends: number;
  offers: number;
  avgOfferPct: number | null; // 0–1
  closes: number;
  computedAt: string;
};

const OFFERISH = new Set(["offer", "loi", "closed"]);

export function parseFlags(raw: unknown): BuyerFlags | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Partial<BuyerFlags>;
  return {
    lowballer: !!f.lowballer, tireKicker: !!f.tireKicker, blacklisted: !!f.blacklisted,
    blacklistReason: f.blacklistReason ?? "", sends: f.sends ?? 0, offers: f.offers ?? 0,
    avgOfferPct: typeof f.avgOfferPct === "number" ? f.avgOfferPct : null, closes: f.closes ?? 0,
    computedAt: f.computedAt ?? "",
  };
}

/** Recompute one buyer's flags from their full DealSend history. */
export async function recomputeBuyerFlags(buyerId: string, actor?: string): Promise<BuyerFlags | null> {
  const [sends, buyer] = await Promise.all([
    db.dealSend.findMany({ where: { buyerId }, select: { outcome: true, offerAmount: true, floorPrice: true, passReason: true } }),
    db.marketContact.findUnique({ where: { id: buyerId }, select: { blacklistedAt: true, blacklistReason: true } }),
  ]);
  if (!buyer) return null;

  const offers = sends.filter((s) => OFFERISH.has(s.outcome));
  const closes = sends.filter((s) => s.outcome === "closed").length;
  const pcts = offers
    .filter((s) => s.offerAmount != null && s.floorPrice != null && s.floorPrice > 0)
    .map((s) => (s.offerAmount as number) / (s.floorPrice as number));
  const avgOfferPct = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  const passesWithReason = sends.filter((s) => s.outcome === "pass" && s.passReason).length;

  const flags: BuyerFlags = {
    lowballer: offers.length >= 3 && avgOfferPct != null && avgOfferPct < 0.7,
    tireKicker: sends.length >= 5 && offers.length === 0 && passesWithReason === 0,
    blacklisted: !!buyer.blacklistedAt,
    blacklistReason: buyer.blacklistReason ?? "",
    sends: sends.length,
    offers: offers.length,
    avgOfferPct,
    closes,
    computedAt: new Date().toISOString(),
  };
  await updateBuyer(buyerId, { buyerFlags: flags }, actor ?? "system", { action: "flags_recompute" });
  return flags;
}

/** Record that a deal went out to a buyer. Returns the DealSend id. */
export async function logDealSend(input: {
  dealId: string; buyerId: string; channel?: string; wave?: number; packetUrl?: string;
  floorPrice?: number | null; askPrice?: number | null; actor?: string;
}): Promise<string> {
  const row = await db.dealSend.create({ data: {
    dealId: input.dealId, buyerId: input.buyerId, channel: input.channel ?? "email",
    wave: input.wave ?? 1, packetUrl: input.packetUrl ?? "",
    floorPrice: input.floorPrice ?? null, askPrice: input.askPrice ?? null, actor: input.actor ?? "",
  } });
  await recomputeBuyerFlags(input.buyerId, input.actor).catch(() => {});
  return row.id;
}

/** Record what came back: outcome / offer amount / pass reason. Never deletes. */
export async function setDealSendOutcome(
  sendId: string,
  patch: { outcome?: string; offerAmount?: number | null; passReason?: string; note?: string },
  actor?: string,
): Promise<void> {
  const row = await db.dealSend.update({ where: { id: sendId }, data: {
    ...(patch.outcome !== undefined ? { outcome: patch.outcome, respondedAt: patch.outcome ? new Date() : null } : {}),
    ...(patch.offerAmount !== undefined ? { offerAmount: patch.offerAmount } : {}),
    ...(patch.passReason !== undefined ? { passReason: patch.passReason } : {}),
    ...(patch.note !== undefined ? { note: patch.note } : {}),
    ...(actor ? { actor } : {}),
  }, select: { buyerId: true } });
  await recomputeBuyerFlags(row.buyerId, actor).catch(() => {});
}

/** For the cascade: the most recent un-responded send for this deal+buyer (so a
 *  claim/pass click updates the row the email actually came from). */
export async function openSendFor(dealId: string, buyerId: string): Promise<string | null> {
  const row = await db.dealSend.findFirst({ where: { dealId, buyerId, outcome: "" }, orderBy: { sentAt: "desc" }, select: { id: true } });
  return row?.id ?? null;
}

/** Blacklist = excluded from the cascade, greyed on cards, NEVER deleted. */
export async function setBlacklist(buyerId: string, reason: string, actor: string): Promise<void> {
  await updateBuyer(buyerId, { blacklistedAt: new Date(), blacklistReason: reason.slice(0, 200) }, actor, { action: "blacklist" });
  await recomputeBuyerFlags(buyerId, actor).catch(() => {});
}
export async function clearBlacklist(buyerId: string, actor: string): Promise<void> {
  await updateBuyer(buyerId, { blacklistedAt: null, blacklistReason: null }, actor, { action: "unblacklist" });
  await recomputeBuyerFlags(buyerId, actor).catch(() => {});
}

/** Weekly digest numbers (reused by the Friday buyer report). */
export async function feedbackDigest(sinceDays = 7): Promise<{
  responsive: Array<{ name: string; sends: number; offers: number }>;
  dark: Array<{ name: string; sends: number }>;
  newLowballers: Array<{ name: string; avgPct: number }>;
  allPassCounties: string[];
}> {
  const since = new Date(Date.now() - sinceDays * 86400000);
  const buyers = await db.marketContact.findMany({
    where: { archivedAt: null, dealSends: { some: {} } },
    select: { id: true, name: true, buyerFlags: true, dealSends: { select: { outcome: true, sentAt: true, passReason: true } } },
  });
  const responsive = buyers
    .map((b) => ({ name: b.name, sends: b.dealSends.length, offers: b.dealSends.filter((s) => OFFERISH.has(s.outcome)).length, replied: b.dealSends.filter((s) => s.outcome && s.outcome !== "no_reply").length }))
    .filter((b) => b.replied > 0)
    .sort((a, b) => b.offers - a.offers || b.replied - a.replied)
    .slice(0, 10)
    .map(({ name, sends, offers }) => ({ name, sends, offers }));
  const dark = buyers
    .map((b) => ({ name: b.name, sends: b.dealSends.length, replies: b.dealSends.filter((s) => s.outcome && s.outcome !== "no_reply").length }))
    .filter((b) => b.sends >= 2 && b.replies === 0)
    .sort((a, b) => b.sends - a.sends)
    .slice(0, 10)
    .map(({ name, sends }) => ({ name, sends }));
  const newLowballers = buyers
    .filter((b) => {
      const f = parseFlags(b.buyerFlags);
      return f?.lowballer && f.computedAt >= since.toISOString();
    })
    .map((b) => ({ name: b.name, avgPct: Math.round((parseFlags(b.buyerFlags)?.avgOfferPct ?? 0) * 100) }));
  // Counties where every send in the window came back "pass" → wrong buyer list for that area
  const recent = await db.dealSend.findMany({ where: { sentAt: { gte: since } }, select: { dealId: true, outcome: true } });
  const byDeal = new Map<string, { passes: number; total: number }>();
  for (const s of recent) {
    const e = byDeal.get(s.dealId) ?? { passes: 0, total: 0 };
    e.total++; if (s.outcome === "pass") e.passes++;
    byDeal.set(s.dealId, e);
  }
  const allPassDeals = [...byDeal.entries()].filter(([, v]) => v.total >= 3 && v.passes === v.total).map(([id]) => id);
  const deals = allPassDeals.length ? await db.deal.findMany({ where: { id: { in: allPassDeals } }, select: { address: true } }) : [];
  return { responsive, dark, newLowballers, allPassCounties: deals.map((d) => d.address) };
}
