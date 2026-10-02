// Phase 8: parcel lookup — APN → polygon, acreage, zoning, situs. Regrid first
// (REGRID_API_KEY); owner name intentionally never surfaced (redacted per spec).
// Pluggable so county GIS layers can slot in later for keyless counties.
import { fetchCached, getJson } from "@/lib/geo/fetchCached";
import type { ParcelInfo } from "@/lib/packet/types";

type RegridResp = {
  parcels?: { features?: Array<{ geometry: GeoJSON.Geometry; properties?: { fields?: Record<string, unknown>; headline?: string } }> };
};

function centroidOf(geom: GeoJSON.Geometry): { lat: number; lng: number } {
  const pts: number[][] = [];
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") pts.push(c as number[]);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  walk((geom as GeoJSON.Polygon).coordinates);
  const lng = pts.reduce((a, p) => a + p[0], 0) / Math.max(1, pts.length);
  const lat = pts.reduce((a, p) => a + p[1], 0) / Math.max(1, pts.length);
  return { lat, lng };
}

/** Look one APN up in Regrid. `path` like "/us/fl/charlotte". */
export async function parcelByApn(apn: string, stateAbbr: string, countyName: string): Promise<ParcelInfo | null> {
  const token = process.env.REGRID_API_KEY;
  if (!token) return null; // caller renders the 🟡 "add REGRID_API_KEY" warning
  const path = `/us/${stateAbbr.toLowerCase()}/${countyName.toLowerCase().replace(/[^a-z]+/g, "")}`;
  const data = await fetchCached<RegridResp>("regrid", { apn, path }, () =>
    getJson<RegridResp>(
      `https://app.regrid.com/api/v2/parcels/apn?parcelnumb=${encodeURIComponent(apn)}&path=${encodeURIComponent(path)}&token=${token}`,
    ),
  );
  const feat = data.parcels?.features?.[0];
  if (!feat) return null;
  const f = (feat.properties?.fields ?? {}) as Record<string, unknown>;
  const { lat, lng } = centroidOf(feat.geometry);
  return {
    apn,
    address: String(f.address ?? f.saddress ?? feat.properties?.headline ?? "").trim(),
    county: `${String(f.county ?? countyName).replace(/ county/i, "")}, ${stateAbbr.toUpperCase()}`,
    state: stateAbbr.toUpperCase(),
    acres: typeof f.ll_gisacre === "number" ? f.ll_gisacre : typeof f.gisacre === "number" ? (f.gisacre as number) : null,
    zoning: String(f.zoning ?? f.zoning_description ?? "").trim(),
    lat,
    lng,
    polygon: { type: "Feature", geometry: feat.geometry, properties: {} },
    source: "regrid",
  };
}
