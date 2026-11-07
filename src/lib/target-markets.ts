// 🗺 Target Markets — where we hunt land, how covered each market is, and how it's trending
// (Jon 2026-11-05: "track which markets we pull from + how they perform, visual, 30-60-180
// method"). Seeded from Viktoriia's Florida Wealth & Business Elite research (Nov 2026):
// high-net-worth, expensive-home, business-dense metros where the wealthy keep building on
// the water through rate hikes — and where few wholesalers compete. We target the land plays
// others ignore: big acreage lots, infill luxury residential lots, and commercial land for
// developers. No schema — markets + pull log live in reserved Resource JSON.
import { db } from "@/lib/db";

export type LandFocus = "acreage" | "infill_luxury" | "commercial";
export const LAND_FOCUS_META: Record<LandFocus, { label: string; emoji: string }> = {
  acreage: { label: "Big acreage lots", emoji: "🌄" },
  infill_luxury: { label: "Infill luxury lots", emoji: "🏝️" },
  commercial: { label: "Commercial land", emoji: "🏗️" },
};

export type Trend = "up" | "flat" | "down" | "";
export type MarketStatus = "target" | "active" | "paused";

export type TargetMarket = {
  id: string;
  name: string;
  region: string;
  state: string;
  wealth: number;    // 1–5 (research score)
  business: number;  // 1–5
  profile: string;
  enclaves: string[];
  landFocus: LandFocus[];
  waterfront: boolean;
  status: MarketStatus;
  trend: Trend;       // the owner's 30-60-180 read
  trendNote: string;
  trendAt: string;    // YYYY-MM-DD of the last trend read
  notes: string;
};

export type MarketPull = {
  id: string; marketId: string; date: string; source: string; count: number; landType: string; by: string; note: string;
};

const MARKETS_CAT = "__target_markets__";
const PULLS_CAT = "__market_pulls__";
export const PULL_COOLDOWN_DAYS = 60; // don't re-pull the same market inside this window

function id(): string { return Math.random().toString(36).slice(2, 10); }

// ── Seed: Viktoriia's FL research (wealth/business 1–5, enclaves, profile). Land-focus +
// waterfront reflect Jon's strategy (coastal wealth → waterfront; big metros carry all three
// land plays). Editable in-app afterward. ──
const SEED: Omit<TargetMarket, "id">[] = [
  { name: "Miami / Coral Gables", region: "South Florida", state: "FL", wealth: 5, business: 5, profile: "International finance, founders", enclaves: ["Coral Gables", "Coconut Grove", "Key Biscayne", "Pinecrest"], landFocus: ["infill_luxury", "commercial"], waterfront: true, status: "target", trend: "", trendNote: "", trendAt: "", notes: "" },
  { name: "Palm Beach / West Palm Beach", region: "South Florida", state: "FL", wealth: 5, business: 4.5, profile: "Private wealth, hedge funds, family offices", enclaves: ["Palm Beach", "Manalapan", "Palm Beach Gardens", "Jupiter"], landFocus: ["acreage", "infill_luxury", "commercial"], waterfront: true, status: "target", trend: "", trendNote: "", trendAt: "", notes: "Residential prestige center; WPB has expanding commercial infrastructure." },
  { name: "Boca Raton / Fort Lauderdale", region: "South Florida", state: "FL", wealth: 4.5, business: 4.5, profile: "Owners, professional services", enclaves: ["Boca Raton", "Las Olas", "Harbor Beach", "Fort Lauderdale"], landFocus: ["infill_luxury", "commercial"], waterfront: true, status: "target", trend: "", trendNote: "", trendAt: "", notes: "" },
  { name: "Naples / Port Royal", region: "SW Florida", state: "FL", wealth: 5, business: 2.5, profile: "Investors, established & retirement wealth", enclaves: ["Port Royal", "Aqualane Shores", "Pelican Bay", "Grey Oaks"], landFocus: ["acreage", "infill_luxury"], waterfront: true, status: "target", trend: "", trendNote: "", trendAt: "", notes: "High residential affluence; smaller business ecosystem." },
  { name: "Orlando / Windermere / Winter Park", region: "Central Florida", state: "FL", wealth: 4, business: 4.5, profile: "Entrepreneurs, executives", enclaves: ["Isleworth", "Keene's Pointe", "Winter Park", "Lake Nona", "Golden Oak"], landFocus: ["acreage", "infill_luxury", "commercial"], waterfront: true, status: "target", trend: "", trendNote: "", trendAt: "", notes: "Windermere = private lakefront estates." },
  { name: "Tampa Bay", region: "Tampa Bay", state: "FL", wealth: 4, business: 5, profile: "Corporate operators, founders", enclaves: ["Davis Islands", "Beach Park", "Hyde Park", "Avila", "Snell Isle"], landFocus: ["infill_luxury", "commercial"], waterfront: true, status: "target", trend: "", trendNote: "", trendAt: "", notes: "Most diversified business economy." },
  { name: "Sarasota / Lakewood Ranch", region: "SW Florida", state: "FL", wealth: 4, business: 3.5, profile: "Affluent families, investors", enclaves: ["Longboat Key", "Bird Key", "Lakewood Ranch"], landFocus: ["acreage", "infill_luxury"], waterfront: true, status: "target", trend: "", trendNote: "", trendAt: "", notes: "" },
  { name: "Jacksonville / Ponte Vedra", region: "NE Florida", state: "FL", wealth: 4, business: 4.5, profile: "Corporate leadership, logistics", enclaves: ["Ponte Vedra Beach", "Sawgrass", "Marsh Landing", "San Marco", "Ortega"], landFocus: ["acreage", "commercial"], waterfront: true, status: "target", trend: "", trendNote: "", trendAt: "", notes: "" },
  { name: "Jupiter Island / Vero Beach", region: "Treasure Coast", state: "FL", wealth: 5, business: 2, profile: "Private wealth, second homes", enclaves: ["Jupiter Island", "Hobe Sound", "Vero Beach"], landFocus: ["acreage", "infill_luxury"], waterfront: true, status: "target", trend: "", trendNote: "", trendAt: "", notes: "Exclusive estates, privacy; small local business base." },
  { name: "30A / Alys Beach (NW Florida)", region: "Panhandle", state: "FL", wealth: 4.5, business: 2, profile: "Vacation & second-home wealth", enclaves: ["Alys Beach", "Rosemary Beach", "Destin"], landFocus: ["infill_luxury"], waterfront: true, status: "target", trend: "", trendNote: "", trendAt: "", notes: "Luxury second-home / vacation capital." },

  // ── South Carolina (Jon 2026-11-06: "research SC + Viktoriia's FL markets so we can pull there").
  // Scores from SC growth data: Jasper = #1 fastest-growing US county 2024–25 (+6%); Horry/Berkeley/
  // Aiken each +3%+ housing; Greenville = strongest Upstate economy; Charleston/Beaufort = coastal
  // wealth. Land plays: coastal infill/waterfront, lake lots, and acreage feeding master-planned builds. ──
  { name: "Bluffton / Hardeeville (Jasper)", region: "Lowcountry SC", state: "SC", wealth: 4, business: 3, profile: "Coastal in-migration, master-planned builders", enclaves: ["Bluffton", "Hardeeville", "Palmetto Bluff", "Sun City"], landFocus: ["acreage", "commercial", "infill_luxury"], waterfront: true, status: "target", trend: "up", trendNote: "#1 fastest-growing county in the US (Census 2024–25, +6%).", trendAt: "2026-11-06", notes: "Master-planned coastal land; builders buying acreage ahead of rooftops." },
  { name: "Hilton Head / Beaufort (Beaufort)", region: "Lowcountry SC", state: "SC", wealth: 4.5, business: 2.5, profile: "Coastal retirement & second-home wealth", enclaves: ["Hilton Head Island", "Beaufort", "Port Royal", "Dataw Island"], landFocus: ["infill_luxury", "acreage"], waterfront: true, status: "target", trend: "up", trendNote: "Sustained Lowcountry in-migration.", trendAt: "2026-11-06", notes: "Waterfront + gated-community infill lots." },
  { name: "Charleston / Mount Pleasant / Daniel Island", region: "Lowcountry SC", state: "SC", wealth: 5, business: 4.5, profile: "Coastal wealth, tech & port economy", enclaves: ["Daniel Island", "Mount Pleasant", "Sullivan's Island", "Kiawah", "I'On"], landFocus: ["infill_luxury", "commercial"], waterfront: true, status: "target", trend: "up", trendNote: "Premier SC market; steady high-end absorption.", trendAt: "2026-11-06", notes: "Daniel Island / Mt Pleasant infill + commercial outparcels." },
  { name: "Summerville / Nexton (Berkeley)", region: "Charleston Metro SC", state: "SC", wealth: 3.5, business: 4, profile: "Master-planned suburban boom", enclaves: ["Nexton", "Cane Bay", "Summerville", "Moncks Corner"], landFocus: ["acreage", "commercial", "infill_luxury"], waterfront: false, status: "target", trend: "up", trendNote: "Berkeley +3%+ housing (Census).", trendAt: "2026-11-06", notes: "Explosive master-planned growth N of Charleston — builders need dirt." },
  { name: "Myrtle Beach / Grand Strand (Horry)", region: "Grand Strand SC", state: "SC", wealth: 3.5, business: 4, profile: "Vacation & second-home, high transaction volume", enclaves: ["Myrtle Beach", "North Myrtle Beach", "Carolina Forest", "Murrells Inlet"], landFocus: ["infill_luxury", "commercial", "acreage"], waterfront: true, status: "target", trend: "up", trendNote: "Top-3 housing growth in SC.", trendAt: "2026-11-06", notes: "High volume; infill lots + commercial along the Strand." },
  { name: "Greenville / Greer (Upstate)", region: "Upstate SC", state: "SC", wealth: 4, business: 5, profile: "Advanced manufacturing, strongest SC economy", enclaves: ["Greenville", "Greer", "Travelers Rest", "Simpsonville"], landFocus: ["infill_luxury", "commercial"], waterfront: false, status: "target", trend: "up", trendNote: "BMW/Michelin corridor; sustained job + permit growth.", trendAt: "2026-11-06", notes: "Downtown infill + commercial; strongest business base in SC." },
  { name: "Spartanburg (Upstate)", region: "Upstate SC", state: "SC", wealth: 3, business: 4.5, profile: "Industrial & logistics expansion", enclaves: ["Spartanburg", "Boiling Springs", "Duncan"], landFocus: ["commercial", "infill_luxury"], waterfront: false, status: "target", trend: "up", trendNote: "Logistics/industrial growth feeding the I-85 corridor.", trendAt: "2026-11-06", notes: "Commercial + infill behind the Upstate manufacturing wave." },
  { name: "Rock Hill / Fort Mill (York)", region: "Charlotte Border SC", state: "SC", wealth: 4, business: 4, profile: "Charlotte NC spillover, fast suburban growth", enclaves: ["Fort Mill", "Tega Cay", "Rock Hill", "Lake Wylie"], landFocus: ["infill_luxury", "acreage", "commercial"], waterfront: true, status: "target", trend: "up", trendNote: "Charlotte spillover keeps pulling rooftops south.", trendAt: "2026-11-06", notes: "Suburban infill + acreage; Lake Wylie waterfront." },
  { name: "Lake Keowee / Clemson (Oconee)", region: "Upstate SC", state: "SC", wealth: 4, business: 2.5, profile: "Luxury lake & second-home wealth", enclaves: ["Lake Keowee", "Seneca", "Salem", "Clemson"], landFocus: ["acreage", "infill_luxury"], waterfront: true, status: "target", trend: "up", trendNote: "Premium lake demand holding through rate cycle.", trendAt: "2026-11-06", notes: "Waterfront acreage + lake lots (Keowee)." },
  { name: "Aiken (CSRA)", region: "Midlands SC", state: "SC", wealth: 3.5, business: 3, profile: "Equestrian wealth + Augusta GA spillover", enclaves: ["Aiken", "Montmorenci", "North Augusta"], landFocus: ["acreage", "infill_luxury"], waterfront: false, status: "target", trend: "up", trendNote: "Aiken +3% housing (Census); Augusta spillover.", trendAt: "2026-11-06", notes: "Horse country acreage + estate lots." },
  { name: "Columbia / Lake Murray (Lexington)", region: "Midlands SC", state: "SC", wealth: 3.5, business: 4, profile: "State capital metro + lake wealth", enclaves: ["Lake Murray", "Lexington", "Chapin", "Irmo"], landFocus: ["acreage", "infill_luxury", "commercial"], waterfront: true, status: "target", trend: "flat", trendNote: "Steady capital-metro demand; lake lots premium.", trendAt: "2026-11-06", notes: "Lake Murray waterfront + suburban land W of Columbia." },
];

export async function readTargetMarkets(): Promise<TargetMarket[]> {
  const row = await db.resource.findFirst({ where: { category: MARKETS_CAT } }).catch(() => null);
  if (row?.description) {
    try {
      const list = JSON.parse(row.description);
      if (Array.isArray(list) && list.length) {
        // Merge-append any NEW seed market not already stored (by name) — so markets added in code
        // (e.g. the South Carolina set, Jon 2026-11-06) appear without a manual re-seed, while every
        // existing market + the team's in-app edits are kept. Idempotent: runs once per new market.
        const have = new Set((list as TargetMarket[]).map((m) => (m.name || "").toLowerCase()));
        const missing = SEED.filter((s) => !have.has(s.name.toLowerCase())).map((m) => ({ ...m, id: id() }));
        if (missing.length) {
          const merged = [...(list as TargetMarket[]), ...missing];
          await saveTargetMarkets(merged).catch(() => {});
          return merged;
        }
        return list as TargetMarket[];
      }
    } catch { /* reseed */ }
  }
  // First load → seed from research.
  const seeded: TargetMarket[] = SEED.map((m) => ({ ...m, id: id() }));
  await db.resource.create({ data: { title: "target-markets", category: MARKETS_CAT, url: "", description: JSON.stringify(seeded) } }).catch(() => {});
  return seeded;
}

export async function saveTargetMarkets(list: TargetMarket[]): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: MARKETS_CAT } });
  const description = JSON.stringify(list);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "target-markets", category: MARKETS_CAT, url: "", description } });
}

export async function readMarketPulls(): Promise<MarketPull[]> {
  const row = await db.resource.findFirst({ where: { category: PULLS_CAT } }).catch(() => null);
  if (!row?.description) return [];
  try { const l = JSON.parse(row.description); return Array.isArray(l) ? l as MarketPull[] : []; } catch { return []; }
}

export async function logMarketPull(entry: Omit<MarketPull, "id">): Promise<void> {
  const list = await readMarketPulls();
  list.unshift({ ...entry, id: id() });
  const trimmed = list.slice(0, 2000);
  const row = await db.resource.findFirst({ where: { category: PULLS_CAT } });
  const description = JSON.stringify(trimmed);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "market-pulls", category: PULLS_CAT, url: "", description } });
}

export type Coverage = { lastPull: string | null; pulls90d: number; totalCount: number; status: "clear" | "cooldown" | "never"; cooldownLeft: number };

/** Pull-coverage status for one market from the pull log. */
export function coverageFor(marketId: string, pulls: MarketPull[]): Coverage {
  const mine = pulls.filter((p) => p.marketId === marketId);
  if (!mine.length) return { lastPull: null, pulls90d: 0, totalCount: 0, status: "never", cooldownLeft: 0 };
  const sorted = [...mine].sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = sorted[0].date;
  const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const pulls90d = mine.filter((p) => p.date >= since90).length;
  const totalCount = mine.reduce((s, p) => s + (Number(p.count) || 0), 0);
  const daysSince = Math.floor((Date.now() - Date.parse(`${last}T00:00:00`)) / 86_400_000);
  const cooldownLeft = Math.max(0, PULL_COOLDOWN_DAYS - daysSince);
  return { lastPull: last, pulls90d, totalCount, status: cooldownLeft > 0 ? "cooldown" : "clear", cooldownLeft };
}
