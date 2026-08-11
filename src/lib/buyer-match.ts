// Deal → buyer matching for the Deals board. Upgrades the old geography-only
// substring test into a small scored match with human-readable reasons, and
// filters out buyers that are dead/on-hold so reps only see live options.
//
// Everything here is best-effort over free-text buy-box fields (priceRange,
// buyBoxAreas). It never throws on missing data — a buyer with no areas simply
// scores lower. No schema dependency; safe to run at render time.

export type MatchBuyer = {
  id: string;
  name: string;
  category: string;
  type: string;
  vetStage: string;
  bestContact: string;
  phone: string;
  email: string;
  igHandle: string;
  buyBoxAreas: string;
  market: string;
  priceRange: string;
  closingSpeed?: string;   // "7 days" / "cash 2 weeks" — faster ranks higher
  decisionMaker?: string;  // "Direct/principal" ranks higher than "Agent"
  companySize?: string;    // "National (DR Horton)" / "fund / REIT" ranks higher
  proofOfFunds?: boolean;  // verified cash — cleaner, more certain close
  maxOfferPct?: number;    // % of ARV they'll pay — the sharpest "pays the most" signal
};

export type BuyerMatch = {
  id: string;
  name: string;
  category: string;
  type: string;
  vetStage: string;
  bestContact: string;
  phone: string;
  email: string;
  igHandle: string;
  score: number;
  reasons: string[];
  topPrice: number | null; // the most they'll pay (top of their buy-box range)
  priceRange: string;
  fast: boolean;           // cash / developer = quicker, cleaner close
  rank: number;            // 1 = send first, cascade down from there
};

const AREA_STOP = new Set(["the", "and", "san", "los", "new", "for", "all", "any", "ave", "rd", "st", "dr", "blvd", "ca", "usa"]);

/** Split a free-text area blob into meaningful lowercase tokens. */
function areaTokens(s: string): string[] {
  return (s || "")
    .split(/[,\n;/]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 4 && !AREA_STOP.has(t));
}

/** Pull the first dollar figure from a string like "$450k", "1.2M", "600,000". */
function parseMoney(s: string): number | null {
  const m = (s || "").replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)\s*([kmkM]?)/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || "").toLowerCase();
  if (unit === "k") n *= 1_000;
  else if (unit === "m") n *= 1_000_000;
  else if (n < 10_000) n *= 1_000; // bare "450" almost always means 450k in this context
  return n;
}

/** Parse a close-speed string like "7 days", "cash 2 weeks", "~1 month" → number of days. */
function parseDays(s: string | null | undefined): number | null {
  const m = (s || "").match(/(\d+)\s*(day|week|wk|month|mo)/i);
  if (!m) return null;
  let n = parseInt(m[1], 10);
  const u = m[2].toLowerCase();
  if (u.startsWith("week") || u === "wk") n *= 7;
  else if (u.startsWith("mo")) n *= 30;
  return Number.isFinite(n) ? n : null;
}

/** Parse a price range like "$400k–$700k" / "400-700k" / "up to 1.2M". Returns [min,max]. */
function parseRange(s: string): [number | null, number | null] {
  if (!s) return [null, null];
  const nums = (s.match(/\$?\s*\d+(?:\.\d+)?\s*[kmKM]?/g) || []).map(parseMoney).filter((n): n is number => n != null);
  if (nums.length >= 2) return [Math.min(nums[0], nums[1]), Math.max(nums[0], nums[1])];
  if (nums.length === 1) {
    if (/up to|under|max|below|<|≤/i.test(s)) return [null, nums[0]];
    if (/from|over|above|min|>|≥|\+/i.test(s)) return [nums[0], null];
    return [nums[0] * 0.7, nums[0] * 1.3]; // single number → a loose band around it
  }
  return [null, null];
}

/**
 * Rank buyers for a deal. `dealPrice` is the contract or asking price (either works).
 * Buyers with vetStage dead/hold are dropped entirely.
 */
export function matchBuyersForDeal(
  address: string,
  dealPrice: number | null,
  buyers: MatchBuyer[],
): BuyerMatch[] {
  const a = (address || "").toLowerCase();
  const out: BuyerMatch[] = [];

  for (const b of buyers) {
    if (b.vetStage === "dead" || b.vetStage === "hold") continue;
    const reasons: string[] = [];
    let score = 0;

    // 1) Area/geography — the strongest signal.
    const tokens = [...areaTokens(b.buyBoxAreas), ...areaTokens(b.market)];
    const hit = a ? tokens.find((t) => a.includes(t)) : null;
    if (hit) {
      score += 10;
      reasons.push(`📍 ${hit.replace(/\b\w/g, (c) => c.toUpperCase())}`);
    }

    // 2) Price fit + how much they'll pay (the cascade's core signal).
    const [lo, hi] = parseRange(b.priceRange);
    const topPrice = hi; // the most they'll pay = top of their stated box
    if (dealPrice != null && (lo != null || hi != null)) {
      const okLo = lo == null || dealPrice >= lo * 0.9;
      const okHi = hi == null || dealPrice <= hi * 1.1;
      if (okLo && okHi) {
        score += 4;
        reasons.push(`💲 fits their ${b.priceRange} box`);
      } else {
        score -= 3; // stated a range and this deal is clearly outside it
      }
    }
    // Pays-the-most: a higher ceiling ranks up, capped so a real area fit still leads.
    if (topPrice != null) {
      score += Math.min(6, topPrice / 200_000);
      reasons.push(`💰 up to ${usdShort(topPrice)}`);
    }

    // 3) Speed — how fast they close (stated days beat a type guess).
    const days = parseDays(b.closingSpeed);
    const fast = days != null ? days <= 21 : /cash|develop|custom|build|remodel|flip|investor/i.test(`${b.type} ${b.category}`);
    if (days != null) {
      score += Math.max(0, 5 - days / 7); // 7d → +4, 21d → +2, 35d → +0
      reasons.push(`⚡ ~${days}-day close`);
    } else if (fast) {
      score += 2;
      reasons.push("⚡ cash / fast close");
    }

    // 4) Positioning — direct principals and national/fund buyers are stronger, cleaner exits.
    if (/direct|principal/i.test(b.decisionMaker ?? "")) { score += 2; reasons.push("🎯 direct decision-maker"); }
    if (/national|fund|reit|regional/i.test(b.companySize ?? "")) { score += 1.5; reasons.push("🏢 institutional"); }

    // 4b) Explicit terms — verified proof of funds + how high they'll go (% of ARV).
    if (b.proofOfFunds) { score += 2.5; reasons.push("💵 proof of funds"); }
    if (b.maxOfferPct != null && b.maxOfferPct > 0) {
      score += Math.min(4, Math.max(0, (b.maxOfferPct - 70) / 5)); // 80% → +2, 90% → +4
      reasons.push(`📈 up to ${Math.round(b.maxOfferPct)}% ARV`);
    }

    // 5) Vetted/active buyers are readier than raw leads.
    if (b.vetStage === "active") score += 2;
    else if (b.vetStage === "vetted") score += 1;

    // Only surface a buyer if there's a real area hit (avoids noise from price-only).
    if (hit && score > 0) {
      out.push({
        id: b.id, name: b.name, category: b.category, type: b.type, vetStage: b.vetStage,
        bestContact: b.bestContact, phone: b.phone, email: b.email, igHandle: b.igHandle,
        score, reasons, topPrice, priceRange: b.priceRange, fast, rank: 0,
      });
    }
  }

  // Cascade order: best overall fit first, tie-broken by who pays the most.
  out.sort((x, y) => (y.score - x.score) || ((y.topPrice ?? 0) - (x.topPrice ?? 0)));
  out.forEach((m, i) => { m.rank = i + 1; });
  return out;
}

/** Compact USD for buy-box ceilings, e.g. 1_250_000 → "$1.3M", 450_000 → "$450k". */
function usdShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  return `$${Math.round(n / 1000)}k`;
}
