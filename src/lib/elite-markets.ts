// 🏆 Elite-land targeting (Jon 2026-11-08, from Viktoriia's "Florida Wealth & Business Elite
// Research"). The thesis: pull BIG, buildable, highly-valuable lots in affluent / waterfront /
// business-dense areas to sell to DEVELOPERS — NOT small cheap "penny lots" (Lehigh Acres). John
// Duong made millions in Winter Park. This encodes (a) a WEALTH tier per county so affluent markets
// rank up even when land data is thin (e.g. Palm Beach), and (b) the named sub-county ENCLAVES to
// pull (the money is in Winter Park / Port Royal / Ponte Vedra, which live inside their counties).
// Pure data — client-safe (no server imports).

export type WealthTier = { wealth: number; business: number; label: string; enclaves: string[] };

// County FIPS → Viktoriia's 1–5 wealth/business scores + the elite enclaves inside it.
export const WEALTH_TIERS: Record<string, WealthTier> = {
  "12086": { wealth: 5.0, business: 5.0, label: "Miami / Coral Gables", enclaves: ["Coral Gables", "Coconut Grove", "Key Biscayne"] },
  "12099": { wealth: 5.0, business: 4.5, label: "Palm Beach / West Palm Beach", enclaves: ["Palm Beach", "Manalapan", "Jupiter", "Palm Beach Gardens", "Boca Raton"] },
  "12011": { wealth: 4.5, business: 4.5, label: "Boca Raton / Fort Lauderdale", enclaves: ["Fort Lauderdale", "Las Olas", "Parkland"] },
  "12021": { wealth: 5.0, business: 2.5, label: "Naples / Port Royal", enclaves: ["Port Royal", "Aqualane Shores", "Pelican Bay", "Grey Oaks", "Marco Island"] },
  "12095": { wealth: 4.0, business: 4.5, label: "Orlando / Windermere / Winter Park", enclaves: ["Windermere", "Isleworth", "Keene's Pointe", "Winter Park", "Lake Nona", "Golden Oak"] },
  "12057": { wealth: 4.0, business: 5.0, label: "Tampa Bay", enclaves: ["Davis Islands", "Avila", "Beach Park", "Hyde Park"] },
  "12103": { wealth: 4.0, business: 5.0, label: "Tampa Bay (Pinellas)", enclaves: ["Snell Isle", "Belleair"] },
  "12115": { wealth: 4.0, business: 3.5, label: "Sarasota / Lakewood Ranch", enclaves: ["Longboat Key", "Bird Key", "Siesta Key"] },
  "12081": { wealth: 4.0, business: 3.5, label: "Lakewood Ranch / Bradenton", enclaves: ["Lakewood Ranch", "Anna Maria"] },
  "12031": { wealth: 4.0, business: 4.5, label: "Jacksonville", enclaves: ["San Marco", "Ortega", "Atlantic Beach"] },
  "12109": { wealth: 4.5, business: 4.0, label: "Ponte Vedra / St Johns", enclaves: ["Ponte Vedra Beach", "Sawgrass", "Marsh Landing"] },
  "12085": { wealth: 5.0, business: 2.0, label: "Jupiter Island / Treasure Coast", enclaves: ["Jupiter Island", "Hobe Sound", "Sewall's Point"] },
  "12061": { wealth: 5.0, business: 2.0, label: "Vero Beach", enclaves: ["Vero Beach", "John's Island", "Orchid"] },
  "12131": { wealth: 4.5, business: 2.0, label: "30A / Alys Beach", enclaves: ["Alys Beach", "Rosemary Beach", "Santa Rosa Beach", "Seaside"] },
  "12091": { wealth: 4.5, business: 2.0, label: "Destin / Emerald Coast", enclaves: ["Destin", "Miramar Beach", "Sandestin"] },
  "12087": { wealth: 4.5, business: 2.0, label: "Florida Keys", enclaves: ["Key West", "Islamorada", "Key Largo"] },
};

export function wealthFor(fips: string): WealthTier | null {
  return WEALTH_TIERS[fips] ?? null;
}

// 📍 Elite enclaves as one-click PULL targets — sub-county cities/towns DealMachine can resolve
// (q = a city/town search string). The money is here, below the county level. Grouped by region.
export type Enclave = { name: string; q: string; fips: string; region: string; wealth: number };

export const ELITE_ENCLAVES: Enclave[] = [
  // Palm Beach
  { name: "Palm Beach", q: "Palm Beach, FL", fips: "12099", region: "Palm Beach", wealth: 5.0 },
  { name: "Jupiter", q: "Jupiter, FL", fips: "12099", region: "Palm Beach", wealth: 5.0 },
  { name: "Palm Beach Gardens", q: "Palm Beach Gardens, FL", fips: "12099", region: "Palm Beach", wealth: 5.0 },
  { name: "Boca Raton", q: "Boca Raton, FL", fips: "12099", region: "Palm Beach", wealth: 4.5 },
  // Naples
  { name: "Naples", q: "Naples, FL", fips: "12021", region: "Naples", wealth: 5.0 },
  { name: "Marco Island", q: "Marco Island, FL", fips: "12021", region: "Naples", wealth: 4.5 },
  // Orlando luxury
  { name: "Windermere", q: "Windermere, FL", fips: "12095", region: "Orlando lux", wealth: 5.0 },
  { name: "Winter Park", q: "Winter Park, FL", fips: "12095", region: "Orlando lux", wealth: 4.5 },
  // Treasure Coast
  { name: "Jupiter Island", q: "Jupiter Island, FL", fips: "12085", region: "Treasure Coast", wealth: 5.0 },
  { name: "Vero Beach", q: "Vero Beach, FL", fips: "12061", region: "Treasure Coast", wealth: 5.0 },
  // Tampa Bay
  { name: "Tampa (Davis Is.)", q: "Tampa, FL", fips: "12057", region: "Tampa Bay", wealth: 4.5 },
  // Jacksonville
  { name: "Ponte Vedra Beach", q: "Ponte Vedra Beach, FL", fips: "12109", region: "Jacksonville", wealth: 4.5 },
  // Sarasota
  { name: "Longboat Key", q: "Longboat Key, FL", fips: "12115", region: "Sarasota", wealth: 4.5 },
  { name: "Lakewood Ranch", q: "Lakewood Ranch, FL", fips: "12081", region: "Sarasota", wealth: 4.0 },
  // 30A / Emerald Coast
  { name: "Santa Rosa Beach (30A)", q: "Santa Rosa Beach, FL", fips: "12131", region: "30A", wealth: 4.5 },
  { name: "Destin", q: "Destin, FL", fips: "12091", region: "30A", wealth: 4.5 },
  // Keys
  { name: "Key West", q: "Key West, FL", fips: "12087", region: "Keys", wealth: 4.5 },
];
