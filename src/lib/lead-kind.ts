// 🏞🏡 Land vs Home lead detection (Jon 2026-10-29). The deal is whichever form has MORE
// TYPE-SPECIFIC fields filled — NOT the shared "core" fields (address, APN, motivation…),
// which both forms share and which can get copied between them. So counting only the
// land-specific vs home-specific fields makes the detection immune to that copying. Pure.
const HOME_KEYS = ["yearBuilt", "sqftBedsBaths", "roof", "hvac", "waterHeater", "foundation", "plumbingElectric", "kitchenBaths", "repairs", "tenantLease", "condition"];
const LAND_KEYS = ["acreage", "legalAccess", "easements", "topography", "zoning", "floodZone", "wetlands", "hazard", "build", "rv", "camp", "str", "develop", "hoa", "special", "features", "utilities"];

function filled(section: unknown, keys: string[]): number {
  const s = (section ?? null) as Record<string, unknown> | null;
  if (!s) return 0;
  return keys.filter((k) => { const v = s[k]; return Array.isArray(v) ? v.length > 0 : String(v ?? "").trim().length > 0; }).length;
}

export type LeadKind = "land" | "home" | "";

/** "land" | "home" | "" (unknown / tie). Based on type-specific field counts only. */
export function leadKind(formData: unknown): LeadKind {
  const fd = (formData ?? {}) as Record<string, unknown>;
  const land = filled(fd.land, LAND_KEYS);
  const home = filled(fd.property, HOME_KEYS);
  if (land === 0 && home === 0) return "";
  return land > home ? "land" : home > land ? "home" : "";
}

export function leadKindMeta(k: LeadKind): { emoji: string; label: string; cls: string } | null {
  if (k === "land") return { emoji: "🏞", label: "Land", cls: "bg-lime-100 text-lime-700 ring-lime-200" };
  if (k === "home") return { emoji: "🏡", label: "Home", cls: "bg-orange-100 text-orange-700 ring-orange-200" };
  return null;
}
