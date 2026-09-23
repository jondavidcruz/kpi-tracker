// Region → counties map (copied from warroom-vetted-buyers-build/buybox/
// regions.json — that file is the source; keep them in sync). Used by the
// cascade's geo gate to expand "Nashville MSA" etc. into county matches.
import raw from "./regions.json";

export const REGIONS: Record<string, string[]> = raw as Record<string, string[]>;

/** Counties for a named region, [] when unknown. Case-insensitive lookup. */
export function regionCounties(region: string): string[] {
  if (REGIONS[region]) return REGIONS[region];
  const key = Object.keys(REGIONS).find((k) => k.toLowerCase() === region.trim().toLowerCase());
  return key ? REGIONS[key] : [];
}
