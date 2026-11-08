// 🧾 Recent land SALE prices (Jon 2026-11-08): the share of vacant-land parcels that have actually
// SOLD for ≥$100k in the last ~3 years (DealMachine last_sale_date ≥ 2023 + last_sale_price counts —
// free). The truest "does land actually sell high here" signal, better than the assessor's value:
// Palm Beach 96%, Orange 83%, Collier 77%, Walton 73% vs. Lee/Lehigh Acres 27% (huge volume, mostly
// penny lots). Seeded for the elite counties via the DealMachine tool; fills for every county once
// the v2 key is live in Vercel (same gate as the other land data).
export type LandSold = { share: number; total: number; high: number }; // share ≥$100k · recent sold · # ≥$100k

export const LAND_SOLD: Record<string, LandSold> = {
  "12131": { share: 0.73, total: 4495, high: 3303 },   // Walton / 30A
  "12021": { share: 0.77, total: 4643, high: 3576 },   // Collier / Naples
  "12099": { share: 0.96, total: 7336, high: 7072 },   // Palm Beach
  "12095": { share: 0.83, total: 6059, high: 5035 },   // Orange / Orlando
  "12085": { share: 0.63, total: 1896, high: 1203 },   // Martin / Treasure Coast
  "12109": { share: 0.71, total: 3710, high: 2634 },   // St Johns / Ponte Vedra
  "12115": { share: 0.48, total: 12817, high: 6148 },  // Sarasota
  "12045": { share: 0.60, total: 1712, high: 1029 },   // Gulf
  "12071": { share: 0.27, total: 32878, high: 8789 },  // Lee / Lehigh Acres (cheap-volume contrast)
  "12086": { share: 0.97, total: 4789, high: 4657 },   // Miami-Dade
  "12011": { share: 0.93, total: 2412, high: 2235 },   // Broward
  "12081": { share: 0.96, total: 7043, high: 6763 },   // Manatee / Lakewood Ranch
  "12087": { share: 0.81, total: 1477, high: 1193 },   // Monroe / Keys
};

export function landSoldFor(fips: string): LandSold | null { return LAND_SOLD[fips] ?? null; }
