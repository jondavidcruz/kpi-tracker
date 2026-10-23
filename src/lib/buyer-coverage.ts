// 🗺 Buy-box coverage gaps (Jon 2026-10-22). Dispo can only move a deal if we have
// a buyer who wants that kind of parcel. This compares our DEMAND (open dispo deals)
// against our SUPPLY (vetted buyers' buy-boxes) across price, acreage, and area — so
// acquisitions stops chasing deals we can't sell, and we know exactly what buyer to
// source next. Buyer buy-boxes live two places: network leads (CrmOpportunity
// formData.dev_buybox / agent_profile) and the MarketContact vetted directory.
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/dispo-offers";
import { parseAcres } from "@/lib/acreage";

// ── pure band helpers ───────────────────────────────────────────────────────
export type Band = { key: string; label: string; min: number; max: number };

export const PRICE_BANDS: Band[] = [
  { key: "p0", label: "Under $25k", min: 0, max: 25000 },
  { key: "p1", label: "$25k–50k", min: 25000, max: 50000 },
  { key: "p2", label: "$50k–100k", min: 50000, max: 100000 },
  { key: "p3", label: "$100k–200k", min: 100000, max: 200000 },
  { key: "p4", label: "$200k+", min: 200000, max: Infinity },
];

export const ACRE_BANDS: Band[] = [
  { key: "a0", label: "Under 1 ac", min: 0, max: 1 },
  { key: "a1", label: "1–5 ac", min: 1, max: 5 },
  { key: "a2", label: "5–20 ac", min: 5, max: 20 },
  { key: "a3", label: "20–100 ac", min: 20, max: 100 },
  { key: "a4", label: "100+ ac", min: 100, max: Infinity },
];

/** Pull a dollar ceiling out of free text like "$50k-150k" / "up to 200000" / "2M". */
export function parsePriceCeiling(text: string): number | null {
  if (!text) return null;
  const nums: number[] = [];
  const re = /\$?\s*([\d,]+(?:\.\d+)?)\s*([kmkKM])?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n) || n === 0) continue;
    const suf = (m[2] || "").toLowerCase();
    if (suf === "k") n *= 1000; else if (suf === "m") n *= 1000000;
    else if (n < 1000) n *= 1000; // "150" in a price box means 150k
    nums.push(n);
  }
  return nums.length ? Math.max(...nums) : null;
}

/** Pull an [min,max] acre range out of free text; a single number → [n, n]. */
export function parseAcreRange(text: string): [number, number] | null {
  if (!text) return null;
  const nums = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  return [Math.min(...nums), Math.max(...nums)];
}

const STOP = new Set(["and", "the", "any", "all", "county", "counties", "area", "areas", "or", "n/a", "na", "open", "anywhere", "usa", "us"]);
/** Split a free-text area field ("Polk County, FL; Hardee / Hillsborough") into
 *  normalized location tokens. */
export function areaTokens(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[,/;&\n]| and /i)
    .map((s) => s.replace(/county|counties/gi, "").replace(/[^a-z0-9\s]/gi, "").trim().toLowerCase())
    .filter((s) => s.length >= 2 && !STOP.has(s));
}

// ── server aggregator ───────────────────────────────────────────────────────
export type BandCoverage = Band & { buyers: number; deals: number; status: "gap" | "thin" | "ok" | "idle" };
export type AreaCoverage = { area: string; buyers: number; deals: number; status: "gap" | "thin" | "ok" | "idle" };
export type Coverage = {
  price: BandCoverage[];
  acre: BandCoverage[];
  areas: AreaCoverage[];
  buyerCount: number;
  dealCount: number;
  topGaps: string[]; // plain-English "we have deals but no buyers" headlines
};

function statusFor(buyers: number, deals: number): BandCoverage["status"] {
  if (deals > 0 && buyers === 0) return "gap";       // 🔴 demand, no supply
  if (deals > 0 && buyers < 2) return "thin";        // 🟡 barely covered
  if (deals === 0 && buyers > 0) return "idle";      // 💤 buyers waiting, no deals
  return "ok";
}

export async function getBuyerCoverage(): Promise<Coverage> {
  const { resolveNetworkPipelines } = await import("@/lib/dispo-network");
  const { readPipelines } = await import("@/lib/crm");
  const { crmGroupOf, readPipelineCrm } = await import("@/lib/pipeline-crm");
  const { isDevNetworkName, isAgentNetworkName } = await import("@/lib/dispo-buyers");

  const net = await resolveNetworkPipelines();
  const pipelines = await readPipelines();
  const crmMap = await readPipelineCrm();
  const dealNames = pipelines
    .filter((p) => p.name !== "War Room" && crmGroupOf(p.name, crmMap) === "dispositions" && !isDevNetworkName(p.name) && !isAgentNetworkName(p.name))
    .map((p) => p.name);

  // ── supply: vetted buyers' buy-boxes ──
  type Buyer = { priceMax: number | null; acre: [number, number] | null; areas: string[] };
  const buyers: Buyer[] = [];

  // (a) network leads
  if (net.all.length) {
    const netOpps = await db.crmOpportunity.findMany({ where: { archivedAt: null, pipeline: { in: net.all } }, select: { formData: true } }).catch(() => []);
    for (const o of netOpps) {
      const fd = (o.formData ?? {}) as Record<string, Record<string, unknown>>;
      const dev = fd.dev_buybox ?? {}; const ag = fd.agent_profile ?? {};
      const priceStr = String(dev.priceRange ?? ag.priceRange ?? "");
      const acreStr = String(dev.lotSize ?? "");
      const areaStr = String(dev.buyCounties ?? ag.areas ?? "");
      buyers.push({ priceMax: parsePriceCeiling(priceStr), acre: parseAcreRange(acreStr), areas: areaTokens(areaStr) });
    }
  }
  // (b) MarketContact vetted directory
  const mcs = await db.marketContact.findMany({ where: { vetStage: { in: ["vetted", "active"] } }, select: { priceRange: true, buyBoxAreas: true, market: true, minLotSize: true } }).catch(() => []);
  for (const m of mcs) {
    buyers.push({
      priceMax: parsePriceCeiling(String(m.priceRange ?? "")),
      acre: parseAcreRange(String(m.minLotSize ?? "")),
      areas: areaTokens(`${m.buyBoxAreas ?? ""} ${m.market ?? ""}`),
    });
  }

  // ── demand: open dispo deals ──
  type Deal = { price: number | null; acre: number | null; areas: string[] };
  const deals: Deal[] = [];
  if (dealNames.length) {
    const dealOpps = await db.crmOpportunity.findMany({ where: { archivedAt: null, pipeline: { in: dealNames } }, select: { value: true, askPrice: true, title: true, stage: true, formData: true, contact: { select: { address: true } } } }).catch(() => []);
    for (const o of dealOpps) {
      if (/won|closed|sold|dead|died|nurtur/i.test(o.stage || "")) continue; // only open demand
      const loc = `${o.title ?? ""} ${o.contact?.address ?? ""}`;
      deals.push({ price: o.value ?? o.askPrice ?? null, acre: parseAcres(o.formData), areas: areaTokens(loc) });
    }
  }

  // ── roll up by band ──
  const price: BandCoverage[] = PRICE_BANDS.map((b) => {
    const bu = buyers.filter((x) => x.priceMax != null && x.priceMax >= b.min).length;
    const de = deals.filter((d) => d.price != null && d.price >= b.min && d.price < b.max).length;
    return { ...b, buyers: bu, deals: de, status: statusFor(bu, de) };
  });
  const acre: BandCoverage[] = ACRE_BANDS.map((b) => {
    const bu = buyers.filter((x) => x.acre && x.acre[0] <= b.max && x.acre[1] >= b.min).length;
    const de = deals.filter((d) => d.acre != null && d.acre >= b.min && d.acre < b.max).length;
    return { ...b, buyers: bu, deals: de, status: statusFor(bu, de) };
  });

  // ── areas: union of tokens, count buyers + deals mentioning each ──
  const areaSet = new Map<string, { buyers: number; deals: number }>();
  const bump = (tok: string, which: "buyers" | "deals") => { const r = areaSet.get(tok) ?? { buyers: 0, deals: 0 }; r[which]++; areaSet.set(tok, r); };
  for (const b of buyers) for (const t of new Set(b.areas)) bump(t, "buyers");
  for (const d of deals) for (const t of new Set(d.areas)) bump(t, "deals");
  const areas: AreaCoverage[] = [...areaSet.entries()]
    .map(([area, r]) => ({ area, buyers: r.buyers, deals: r.deals, status: statusFor(r.buyers, r.deals) }))
    .filter((a) => a.deals > 0 || a.buyers >= 2) // noise filter: a lone buyer token isn't signal
    .sort((a, b) => (b.deals - a.deals) || (b.buyers - a.buyers));

  const topGaps: string[] = [];
  for (const b of price) if (b.status === "gap") topGaps.push(`${b.deals} open deal${b.deals > 1 ? "s" : ""} in ${b.label} with no buyer`);
  for (const b of acre) if (b.status === "gap") topGaps.push(`${b.deals} deal${b.deals > 1 ? "s" : ""} at ${b.label} with no buyer`);
  for (const a of areas.filter((x) => x.status === "gap").slice(0, 6)) topGaps.push(`${a.deals} deal${a.deals > 1 ? "s" : ""} in "${a.area}" with no vetted buyer`);

  return { price, acre, areas, buyerCount: buyers.length, dealCount: deals.length, topGaps };
}
