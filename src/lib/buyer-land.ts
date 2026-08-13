// Land buy-box fields for vetted buyers (kept out of "use server" actions).
// Stored per-buyer as JSON in Resource __buyer_land__ (no migration). The
// "isLandBuyer" tag + target zips feed the buyer cascade ranking for lot deals.

export type BuyerLand = {
  isLandBuyer?: boolean;
  pricePerLot?: number;   // what they pay per standard finished/paper lot
  lotMin?: number;        // acres
  lotMax?: number;        // acres
  targetZips?: string;    // comma-separated
  utilitiesRequired?: boolean;
  builderType?: string;   // National | Spec | Mom-and-pop | Fund
  dealBreakers?: string;  // wetlands, main road, no utilities…
  permits12mo?: number;   // permits pulled last 12 months (activity signal)
};

export const BUILDER_TYPES = ["", "National", "Regional/Spec", "Mom-and-pop", "Fund/Investor"];

/** True if any of the buyer's target zips appears in the deal address string. */
export function zipMatch(land: BuyerLand | undefined, address: string): boolean {
  if (!land?.targetZips) return false;
  const zips = land.targetZips.split(/[,\s]+/).map((z) => z.trim()).filter((z) => /^\d{5}$/.test(z));
  return zips.some((z) => address.includes(z));
}
