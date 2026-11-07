// 📈 Real market price trend (Jon 2026-11-05: feed Zillow/Redfin data for the 30-60-180
// method). Uses Zillow Research's FREE published metro home-value index (ZHVI) — officially
// downloadable, no key, no scraping. We fetch the 4.5MB metro CSV ON DEMAND (a manual button,
// never on page render), keep ONLY the small computed trend per market, and discard the file —
// so nothing heavy touches Supabase/Vercel storage. Home-value momentum is a proxy for whether
// a land market is heating (where homes appreciate, land demand follows).
import { db } from "@/lib/db";

const ZHVI_URL = "https://files.zillowstatic.com/research/public_csvs/zhvi/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv";
const CAT = "__market_trends__";

// Our target markets → the Zillow metro RegionName that covers them (several south-FL markets
// share the Miami metro). Matched on exact RegionName + StateName FL.
const ZMETRO: Record<string, string> = {
  "Miami / Coral Gables": "Miami, FL", "Palm Beach / West Palm Beach": "Miami, FL", "Boca Raton / Fort Lauderdale": "Miami, FL",
  "Naples / Port Royal": "Naples, FL", "Orlando / Windermere / Winter Park": "Orlando, FL", "Tampa Bay": "Tampa, FL",
  "Sarasota / Lakewood Ranch": "North Port, FL", "Jacksonville / Ponte Vedra": "Jacksonville, FL",
  "Jupiter Island / Vero Beach": "Sebastian, FL", "30A / Alys Beach (NW Florida)": "Crestview, FL",
  // South Carolina (Jon 2026-11-06) — map each market to its Zillow metro (nearest for micros).
  "Bluffton / Hardeeville (Jasper)": "Hilton Head Island, SC", "Hilton Head / Beaufort (Beaufort)": "Hilton Head Island, SC",
  "Charleston / Mount Pleasant / Daniel Island": "Charleston, SC", "Summerville / Nexton (Berkeley)": "Charleston, SC",
  "Myrtle Beach / Grand Strand (Horry)": "Myrtle Beach, SC", "Greenville / Greer (Upstate)": "Greenville, SC",
  "Spartanburg (Upstate)": "Spartanburg, SC", "Rock Hill / Fort Mill (York)": "Charlotte, NC",
  "Lake Keowee / Clemson (Oconee)": "Greenville, SC", "Aiken (CSRA)": "Augusta, GA",
  "Columbia / Lake Murray (Lexington)": "Columbia, SC",
};
// States whose metros we read (FL + SC and the border metros SC markets fall into).
const TREND_STATES = new Set(["FL", "SC", "NC", "GA"]);

export type MarketTrend = { metro: string; value: number; chg30: number; chg90: number; chg180: number; trend: "up" | "flat" | "down"; asOf: string };
export type TrendStore = { fetchedAt: string; asOf: string; byMarket: Record<string, MarketTrend> };

export async function readMarketTrends(): Promise<TrendStore | null> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  if (!row?.description) return null;
  try { return JSON.parse(row.description) as TrendStore; } catch { return null; }
}

function pct(now: number, then: number): number { return then > 0 ? Math.round(((now - then) / then) * 1000) / 10 : 0; }

/** Fetch Zillow's metro ZHVI, compute 30/90/180-day price change per market, cache the small
 *  result. Returns the store (or an error). Processes in memory; the 4.5MB file is discarded. */
export async function refreshMarketTrends(): Promise<{ ok: boolean; error?: string; store?: TrendStore }> {
  let text: string;
  try {
    const res = await fetch(ZHVI_URL, { headers: { "User-Agent": "FreedomOffers-WarRoom/1.0" }, signal: AbortSignal.timeout(45000), cache: "no-store" });
    if (!res.ok) return { ok: false, error: `Zillow ${res.status}` };
    text = await res.text();
  } catch (e) { return { ok: false, error: String(e).slice(0, 120) }; }

  const lines = text.split("\n");
  const header = lines[0].split(",");
  const iName = header.indexOf("RegionName"), iState = header.indexOf("StateName");
  const firstMonth = Math.max(header.indexOf("StateName") + 1, 5); // month columns follow the meta cols
  if (iName < 0) return { ok: false, error: "unexpected CSV format" };
  const asOf = header[header.length - 1];

  // index the rows we care about by metro name
  const want = new Set(Object.values(ZMETRO));
  const metroRow: Record<string, string[]> = {};
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = lines[i].split(",");
    if (TREND_STATES.has(cols[iState]) && want.has(cols[iName])) metroRow[cols[iName]] = cols;
  }

  const byMarket: Record<string, MarketTrend> = {};
  for (const [market, metro] of Object.entries(ZMETRO)) {
    const cols = metroRow[metro];
    if (!cols) continue;
    const vals = cols.slice(firstMonth).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (vals.length < 7) continue;
    const latest = vals[vals.length - 1];
    const v30 = vals[vals.length - 2], v90 = vals[vals.length - 4], v180 = vals[vals.length - 7];
    const chg90 = pct(latest, v90);
    byMarket[market] = { metro, value: Math.round(latest), chg30: pct(latest, v30), chg90, chg180: pct(latest, v180), trend: chg90 > 1 ? "up" : chg90 < -1 ? "down" : "flat", asOf };
  }
  const store: TrendStore = { fetchedAt: new Date().toISOString(), asOf, byMarket };
  const row = await db.resource.findFirst({ where: { category: CAT } });
  const description = JSON.stringify(store);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "market-trends", category: CAT, url: "", description } });
  return { ok: true, store };
}
