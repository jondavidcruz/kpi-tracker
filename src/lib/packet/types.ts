// Phase 8: PacketModel — everything a draft offering packet renders, matching
// Jon's Port Charlotte template: cover · Offering Summary & Terms · Site & Due
// Diligence Summary · doc index · Tab A parcel maps · Tab B FEMA · Tab C NWI
// wetlands · Tab D soils. Anything an API can't answer renders as a
// 🟡 TO BE VERIFIED pill with the county phone line when we have it.

export type Verified<T> = { value: T; source: string } | { value: null; source: "" }; // null = 🟡 TO BE VERIFIED

export type ParcelInfo = {
  apn: string;
  address: string; // situs
  county: string; // "Charlotte, FL"
  state: string;
  acres: number | null;
  zoning: string;
  lat: number;
  lng: number;
  polygon: GeoJSON.Feature | null;
  source: string; // regrid | county_gis | manual
};

export type FloodInfo = {
  zone: string; // AE, X, …
  subtype: string;
  bfe: string; // static BFE ("9" or "")
  sfha: boolean | null; // in special flood hazard area
  panel: string;
  panelDate: string;
  mapUrl: string; // NFHL export image
};

export type WetlandsInfo = {
  classes: Array<{ attribute: string; type: string }>;
  pctOfParcel: number | null;
  mapUrl: string;
};

export type SoilRow = { name: string; pct: number; drainage: string; hydric: string; flooding: string };

export type ElevationInfo = { minFt: number | null; maxFt: number | null; slopePct: number | null };

export type ParcelDiligence = {
  parcel: ParcelInfo;
  flood: FloodInfo | null;
  wetlands: WetlandsInfo | null;
  soils: SoilRow[];
  elevation: ElevationInfo | null;
  satUrl: string; // satellite + outline (Tab A / cover)
  warnings: string[]; // which lookups failed → 🟡
};

export type PacketModel = {
  dealId: string;
  title: string; // "7 Infill Lots — Port Charlotte, FL"
  county: string;
  state: string;
  generatedAt: string;
  parcels: ParcelDiligence[];
  totals: { parcels: number; acres: number | null };
  // human-entered overrides / to-verify items (water/sewer/electric/setbacks/species)
  manual: { utilitiesWater: string; utilitiesSewer: string; electric: string; setbacks: string; species: string; notes: string; sellerNotes: string };
  countyPhone: string;
  toVerify: string[]; // rendered as 🟡 pills + checklist
};

export const MANUAL_FIELDS = [
  ["utilitiesWater", "Water (county/city/well?)"],
  ["utilitiesSewer", "Sewer (sewer/septic?)"],
  ["electric", "Electric provider at street?"],
  ["setbacks", "Setbacks / buildable envelope"],
  ["species", "Listed species (scrub-jay etc.)"],
] as const;
