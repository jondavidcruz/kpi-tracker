// Land-diligence fields for deals + rendering metadata. Kept out of the
// "use server" actions file (which may only export async functions).

export type DealLand = {
  apn?: string; county?: string; acreage?: string; lotSqFt?: string; zoning?: string;
  legalAccess?: string; physicalAccess?: string; water?: string; sewer?: string; power?: string;
  floodZone?: string; wetlandsPct?: string; slope?: string; hoa?: string; backTaxes?: string;
  falloutReason?: string;
};

// Land-specific fallout reasons (house logic was inspection/financing only).
export const LAND_FALLOUT_REASONS = [
  "Survey issue", "Access / easement problem", "Title defect", "Wetlands / perc fail",
  "Flood zone discovered", "Zoning / entitlement", "Back taxes / liens", "Buyer walked", "Financing", "Other",
];

const YNU = ["", "Yes", "No", "Unknown"];

// Field metadata drives the form + the compact summary. `flag` marks fields whose
// "bad" value should show a red chip on the card (the diligence killers).
export const LAND_FIELDS: { key: keyof DealLand; label: string; type: "text" | "number" | "select"; options?: string[]; ph?: string }[] = [
  { key: "apn", label: "APN", type: "text", ph: "parcel #" },
  { key: "county", label: "County", type: "text" },
  { key: "acreage", label: "Acreage", type: "number", ph: "acres" },
  { key: "lotSqFt", label: "Lot sq ft", type: "number" },
  { key: "zoning", label: "Zoning code", type: "text", ph: "e.g. R-1" },
  { key: "legalAccess", label: "Legal access", type: "select", options: YNU },
  { key: "physicalAccess", label: "Physical access", type: "select", options: YNU },
  { key: "water", label: "Water", type: "select", options: ["", "City", "Well", "None", "Unknown"] },
  { key: "sewer", label: "Sewer", type: "select", options: ["", "City", "Septic", "None", "Unknown"] },
  { key: "power", label: "Power", type: "select", options: ["", "At site", "Nearby", "None", "Unknown"] },
  { key: "floodZone", label: "Flood zone", type: "select", options: ["", "No", "Yes", "Unknown"] },
  { key: "wetlandsPct", label: "Wetlands %", type: "number", ph: "%" },
  { key: "slope", label: "Slope", type: "select", options: ["", "Flat", "Gentle", "Steep", "Unknown"] },
  { key: "hoa", label: "HOA", type: "select", options: YNU },
  { key: "backTaxes", label: "Back taxes owed", type: "number", ph: "$" },
];

/** Red-flag chips for the card header (diligence killers worth seeing at a glance). */
export function landFlags(l: DealLand | undefined): string[] {
  if (!l) return [];
  const flags: string[] = [];
  if (l.floodZone === "Yes") flags.push("🌊 Flood zone");
  if (l.legalAccess === "No") flags.push("🚧 No legal access");
  if (l.physicalAccess === "No") flags.push("🚧 No physical access");
  if (l.wetlandsPct && Number(l.wetlandsPct) > 0) flags.push(`💧 ${l.wetlandsPct}% wetlands`);
  if (l.backTaxes && Number(l.backTaxes) > 0) flags.push(`💰 $${Number(l.backTaxes).toLocaleString()} back taxes`);
  if (l.falloutReason) flags.push(`⚰️ ${l.falloutReason}`);
  return flags;
}
