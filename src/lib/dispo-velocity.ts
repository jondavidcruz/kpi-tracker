// 📊 Dispositions velocity (roadmap B6) — the B-side north star: how fast a signed deal
// becomes a cash buyer, and how buyers move through the funnel. All from DealSend + Deal
// (the cascade/send ledger) — no schema. Acquisitions velocity already lives on
// /crm/velocity; this is its dispo counterpart, shown on the /dispo Team tab.
import { db } from "@/lib/db";

const DAY = 86_400_000;
const OFFERISH = new Set(["offer", "loi", "closed"]);

export type DispoVelocity = {
  windowDays: number;
  funnel: { sent: number; responded: number; offers: number; won: number };
  dealsMarketed: number;      // distinct deals that got at least one buyer send
  dealsWithOffer: number;     // distinct deals that drew an offer/loi/closed
  medToFirstTouchDays: number | null;   // deal created → first buyer send
  medToFirstResponseDays: number | null; // first send → first buyer response
};

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor((s.length - 1) / 2);
  return s.length % 2 ? s[mid] : (s[mid] + s[mid + 1]) / 2;
}

export async function getDispoVelocity(windowDays = 90): Promise<DispoVelocity> {
  const since = new Date(Date.now() - windowDays * DAY);
  const sends = await db.dealSend
    .findMany({ where: { sentAt: { gte: since } }, select: { dealId: true, sentAt: true, respondedAt: true, outcome: true } })
    .catch(() => [] as { dealId: string; sentAt: Date; respondedAt: Date | null; outcome: string }[]);

  const funnel = {
    sent: sends.length,
    responded: sends.filter((s) => s.respondedAt || (s.outcome && s.outcome !== "no_reply")).length,
    offers: sends.filter((s) => OFFERISH.has(s.outcome)).length,
    won: sends.filter((s) => s.outcome === "closed").length,
  };

  // Per-deal rollups: earliest send, earliest response, and whether it drew an offer.
  const firstSend = new Map<string, number>();
  const firstResp = new Map<string, number>();
  const withOffer = new Set<string>();
  for (const s of sends) {
    if (!s.dealId) continue;
    const t = s.sentAt.getTime();
    if (!firstSend.has(s.dealId) || t < firstSend.get(s.dealId)!) firstSend.set(s.dealId, t);
    if (s.respondedAt) { const r = s.respondedAt.getTime(); if (!firstResp.has(s.dealId) || r < firstResp.get(s.dealId)!) firstResp.set(s.dealId, r); }
    if (OFFERISH.has(s.outcome)) withOffer.add(s.dealId);
  }

  // Deal created dates (for days-to-first-touch).
  const dealIds = [...firstSend.keys()];
  const deals = dealIds.length
    ? await db.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, createdAt: true } }).catch(() => [] as { id: string; createdAt: Date }[])
    : [];
  const created = new Map(deals.map((d) => [d.id, d.createdAt.getTime()]));

  const toTouch: number[] = [];
  const toResp: number[] = [];
  for (const [id, sendMs] of firstSend) {
    const c = created.get(id);
    if (c != null) { const d = (sendMs - c) / DAY; if (d >= 0) toTouch.push(d); }
    const r = firstResp.get(id);
    if (r != null) { const d = (r - sendMs) / DAY; if (d >= 0) toResp.push(d); }
  }

  return {
    windowDays,
    funnel,
    dealsMarketed: firstSend.size,
    dealsWithOffer: withOffer.size,
    medToFirstTouchDays: median(toTouch),
    medToFirstResponseDays: median(toResp),
  };
}
