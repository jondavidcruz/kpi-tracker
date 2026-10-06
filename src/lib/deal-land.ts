// Land-diligence fields for deals + rendering metadata. Kept out of the
// "use server" actions file (which may only export async functions).

export type DealLand = {
  apn?: string; county?: string; acreage?: string; lotSqFt?: string; zoning?: string;
  legalAccess?: string; physicalAccess?: string; water?: string; sewer?: string; power?: string;
  floodZone?: string; wetlandsPct?: string; slope?: string; hoa?: string; backTaxes?: string;
  occupied?: string; species?: string; preComped?: string; priced?: string; // Jon's 7-point screen (2026-10-06)
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
  { key: "occupied", label: "Occupied / lived-on", type: "select", options: YNU },
  { key: "species", label: "Listed species (scrub-jay…)", type: "select", options: ["", "None found", "Flagged", "Unknown"] },
  { key: "preComped", label: "Pre-comped (sales 1–3 yrs)", type: "select", options: ["", "Yes", "No", "Unknown"] },
  { key: "priced", label: "Seller price vs comps (1mi/1yr)", type: "select", options: ["", "At/below comps", "Overpriced", "Unknown"] },
];

export const LAND_SCREEN_TOTAL = 7;

// ── Jon's 7-point land screen (whiteboard SOP, 2026-10-06 + overpriced rule) ─
// Michelle's kill-check before a land deal is marketed: wetlands, flood,
// occupied→nurture, listed species, pre-comped 1–3 yrs, not landlocked,
// seller priced right vs comps within 1 mile / 1 year (overpriced → nurture).
export type LandScreen = { pass: number; fails: string[]; unknowns: string[] };

export function landScreen(l: DealLand | undefined): LandScreen {
  const fails: string[] = [];
  const unknowns: string[] = [];
  const check = (label: string, state: "pass" | "fail" | "unknown") => {
    if (state === "fail") fails.push(label);
    else if (state === "unknown") unknowns.push(label);
  };
  if (!l) return { pass: 0, fails, unknowns: ["No wetlands", "Flood zone OK", "Not occupied", "No listed species", "Pre-comped 1–3 yrs", "Not landlocked", "Priced vs comps"] };
  check("No wetlands", l.wetlandsPct === "" || l.wetlandsPct == null ? "unknown" : Number(l.wetlandsPct) > 0 ? "fail" : "pass");
  check("Flood zone OK", l.floodZone === "Yes" ? "fail" : l.floodZone === "No" ? "pass" : "unknown");
  check("Not occupied", l.occupied === "Yes" ? "fail" : l.occupied === "No" ? "pass" : "unknown");
  check("No listed species", l.species === "Flagged" ? "fail" : l.species === "None found" ? "pass" : "unknown");
  check("Pre-comped 1–3 yrs", l.preComped === "No" ? "fail" : l.preComped === "Yes" ? "pass" : "unknown");
  check("Not landlocked", l.legalAccess === "No" || l.physicalAccess === "No" ? "fail" : l.legalAccess === "Yes" && l.physicalAccess === "Yes" ? "pass" : "unknown");
  check("Priced vs comps", l.priced === "Overpriced" ? "fail" : l.priced === "At/below comps" ? "pass" : "unknown");
  return { pass: LAND_SCREEN_TOTAL - fails.length - unknowns.length, fails, unknowns };
}

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
