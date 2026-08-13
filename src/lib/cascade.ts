// Automated buyer cascade (ping-tree). Armed per deal; sends the offer by email to the
// top 3 matched vetted buyers, waits, then advances to the next 3 — until a buyer clicks
// "I want it" (which stops it and pings the team) or the list is exhausted. All state is a
// single JSON row in Resource (category __cascade_auto__) — no schema migration.
import crypto from "crypto";
import { db } from "./db";
import { matchBuyersForDeal, type MatchBuyer, type BuyerMatch } from "./buyer-match";
import { sendEmailTo, sendTeamChat } from "./notify";
import { getChannelConfig } from "./notify";
import { APP_URL } from "./site";

const CAT = "__cascade_auto__";
const SECRET = process.env.CRON_SECRET || "cascade-dev-secret";
const ROUND_SIZE = 3;
export const CASCADE_WINDOW_HOURS = 3; // wait this long before offering to the next 3
// APP_URL is shared from ./site (single env var APP_URL) so a domain change updates
// every outbound email link — weekly reports AND these cascade claim/pass links — at once.

export type DealCascade = { status: "armed" | "claimed" | "stopped" | "done"; round: number; lastAt: string; claimedBy?: string; armedBy?: string; sent: Record<string, "sent" | "passed" | "interested"> };
type Store = Record<string, DealCascade>;

export async function readAuto(): Promise<Store> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  if (!row) return {};
  try { return JSON.parse(row.description || "{}"); } catch { return {}; }
}
async function writeAuto(s: Store) {
  const row = await db.resource.findFirst({ where: { category: CAT } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: JSON.stringify(s) } });
  else await db.resource.create({ data: { title: "cascade-auto", category: CAT, url: "", description: JSON.stringify(s) } });
}

// Signed, non-guessable token so only our emailed links can claim/pass.
export function sign(dealId: string, buyerId: string, action: string): string {
  return crypto.createHmac("sha256", SECRET).update(`${dealId}|${buyerId}|${action}`).digest("hex").slice(0, 20);
}
export function verify(dealId: string, buyerId: string, action: string, sig: string): boolean {
  const good = sign(dealId, buyerId, action);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}

async function rankedForDeal(dealId: string): Promise<{ deal: { address: string; contractPrice: number | null; askingPrice: number | null; nextSteps: string } | null; ranked: BuyerMatch[] }> {
  const deal = await db.deal.findUnique({ where: { id: dealId }, select: { address: true, contractPrice: true, askingPrice: true, nextSteps: true } });
  if (!deal) return { deal: null, ranked: [] };
  const rows = (await db.marketContact.findMany({ where: { vetStage: { in: ["vetted", "active"] } } })).filter((b) => b.type !== "jv_partner");
  const termsRow = await db.resource.findFirst({ where: { category: "__buyer_terms__" } });
  let terms: Record<string, { pof?: boolean; maxOfferPct?: number }> = {};
  try { terms = JSON.parse(termsRow?.description || "{}"); } catch {}
  const landRow = await db.resource.findFirst({ where: { category: "__buyer_land__" } });
  let land: Record<string, { isLandBuyer?: boolean; targetZips?: string }> = {};
  try { land = JSON.parse(landRow?.description || "{}"); } catch {}
  const buyers: MatchBuyer[] = rows.map((r) => ({ ...r, proofOfFunds: terms[r.id]?.pof, maxOfferPct: terms[r.id]?.maxOfferPct, isLandBuyer: land[r.id]?.isLandBuyer, targetZips: land[r.id]?.targetZips }));
  return { deal, ranked: matchBuyersForDeal(deal.address, deal.contractPrice ?? deal.askingPrice, buyers) };
}

function offerHtml(deal: { address: string; contractPrice: number | null; askingPrice: number | null; nextSteps: string }, name: string, claim: string, pass: string): string {
  const price = deal.contractPrice ?? deal.askingPrice;
  const btn = (href: string, bg: string, label: string) => `<a href="${href}" style="display:inline-block;background:${bg};color:#fff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px;margin:4px 8px 4px 0">${label}</a>`;
  return `<div style="font-family:Arial,sans-serif;max-width:520px">
    <p>Hi ${(name.split(" ")[0] || "there").replace(/[<>&]/g, "")},</p>
    <p>New off-market deal that fits your buy box — <b>you're near the front of the line</b>:</p>
    <p style="font-size:17px"><b>${deal.address.replace(/[<>&]/g, "")}</b><br>${price ? `Asking $${Math.round(price).toLocaleString()}` : "Call for pricing"}</p>
    ${deal.nextSteps ? `<p style="color:#475569">${deal.nextSteps.replace(/[<>&]/g, "")}</p>` : ""}
    <p style="margin-top:18px">${btn(claim, "#059669", "✅ I want this deal")}${btn(pass, "#94a3b8", "Pass")}</p>
    <p style="font-size:12px;color:#94a3b8;margin-top:14px">First to claim gets first look at the full package (comps, photos, terms). — Freedom Offers</p>
  </div>`;
}

/** Send the next round (up to 3 not-yet-contacted buyers with email). Returns count sent. */
export async function sendRound(dealId: string): Promise<{ sent: number; done: boolean }> {
  const store = await readAuto();
  const dc = store[dealId] ?? { status: "armed" as const, round: 0, lastAt: "", sent: {} };
  if (dc.status === "claimed" || dc.status === "stopped") return { sent: 0, done: true };
  const { deal, ranked } = await rankedForDeal(dealId);
  if (!deal) return { sent: 0, done: true };
  const next = ranked.filter((m) => !dc.sent[m.id] && m.email).slice(0, ROUND_SIZE);
  if (next.length === 0) { dc.status = "done"; dc.lastAt = new Date().toISOString(); store[dealId] = dc; await writeAuto(store); return { sent: 0, done: true }; }
  for (const m of next) {
    const claim = `${APP_URL}/api/cascade?d=${dealId}&b=${m.id}&a=claim&s=${sign(dealId, m.id, "claim")}`;
    const pass = `${APP_URL}/api/cascade?d=${dealId}&b=${m.id}&a=pass&s=${sign(dealId, m.id, "pass")}`;
    await sendEmailTo([m.email], `Off-market deal — ${deal.address}`, offerHtml(deal, m.name, claim, pass));
    dc.sent[m.id] = "sent";
  }
  dc.round += 1; dc.lastAt = new Date().toISOString(); dc.status = "armed";
  store[dealId] = dc; await writeAuto(store);
  return { sent: next.length, done: false };
}

/** Arm (or re-arm) a deal and immediately send round 1. */
export async function armDeal(dealId: string, by: string): Promise<{ sent: number }> {
  const store = await readAuto();
  store[dealId] = { status: "armed", round: 0, lastAt: "", armedBy: by, sent: {} };
  await writeAuto(store);
  const r = await sendRound(dealId);
  return { sent: r.sent };
}

export async function stopDeal(dealId: string): Promise<void> {
  const store = await readAuto();
  if (store[dealId]) { store[dealId].status = "stopped"; await writeAuto(store); }
}

/** A buyer clicked "I want it" — stop the cascade, record them, ping the team. */
export async function claimDeal(dealId: string, buyerId: string): Promise<"claimed" | "taken" | "invalid"> {
  const store = await readAuto();
  const dc = store[dealId];
  if (!dc) return "invalid";
  if (dc.status === "claimed") return dc.claimedBy === buyerId ? "claimed" : "taken";
  dc.sent[buyerId] = "interested"; dc.status = "claimed"; dc.claimedBy = buyerId; dc.lastAt = new Date().toISOString();
  store[dealId] = dc; await writeAuto(store);
  const [buyer, deal] = await Promise.all([
    db.marketContact.findUnique({ where: { id: buyerId }, select: { name: true, phone: true, email: true } }),
    db.deal.findUnique({ where: { id: dealId }, select: { address: true, assignedTo: true } }),
  ]);
  await sendTeamChat(`🎯 *Cascade WIN* — ${buyer?.name ?? "A buyer"} wants *${deal?.address ?? "the deal"}*! Cascade stopped. Reach them now: ${buyer?.phone || buyer?.email || "see Vetted Buyers"}.`).catch(() => {});
  try {
    const cfg = await getChannelConfig();
    if (cfg.emailRecipients.length) await sendEmailTo(cfg.emailRecipients, `Cascade win — ${deal?.address}`, `<p><b>${buyer?.name}</b> claimed <b>${deal?.address}</b> from the buyer cascade.</p><p>Reach them: ${buyer?.phone || ""} ${buyer?.email || ""}</p>`);
  } catch {}
  return "claimed";
}

export async function passDeal(dealId: string, buyerId: string): Promise<void> {
  const store = await readAuto();
  const dc = store[dealId];
  if (!dc || dc.status === "claimed") return;
  dc.sent[buyerId] = "passed";
  store[dealId] = dc; await writeAuto(store);
}

/** Cron: advance any armed cascade whose last round is older than the window. */
export async function advanceCascades(): Promise<{ advanced: number }> {
  const store = await readAuto();
  let advanced = 0;
  const dealIds = Object.keys(store).filter((id) => store[id].status === "armed").slice(0, 15);
  for (const id of dealIds) {
    const ageMs = Date.now() - new Date(store[id].lastAt || 0).getTime();
    if (ageMs >= CASCADE_WINDOW_HOURS * 3600 * 1000) {
      const r = await sendRound(id);
      if (r.sent > 0) advanced += 1;
    }
  }
  return { advanced };
}
