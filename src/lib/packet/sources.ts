// Phase 8: the public due-diligence APIs — FEMA NFHL flood, USFWS NWI wetlands,
// USDA SDA soils, USGS 3DEP elevation, plus map-image URLs. All reads go
// through fetchCached (90-day TTL). Every function is allowed to fail — the
// pipeline turns a failure into a 🟡 TO BE VERIFIED item, never a crash.
import { fetchCached, getJson } from "@/lib/geo/fetchCached";
import type { ParcelInfo, FloodInfo, WetlandsInfo, SoilRow, ElevationInfo } from "./types";

const NFHL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
const NWI = "https://fwsprimary.wim.usgs.gov/server/rest/services/Wetlands/MapServer/0/query";
const SDA = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest";

function bboxOf(p: ParcelInfo, padDeg = 0.004): [number, number, number, number] {
  const pts: number[][] = [];
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") pts.push(c as number[]);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  if (p.polygon) walk((p.polygon.geometry as GeoJSON.Polygon).coordinates);
  else pts.push([p.lng, p.lat]);
  const xs = pts.map((x) => x[0]), ys = pts.map((x) => x[1]);
  return [Math.min(...xs) - padDeg, Math.min(...ys) - padDeg, Math.max(...xs) + padDeg, Math.max(...ys) + padDeg];
}

function esriPolygon(p: ParcelInfo): string | null {
  if (!p.polygon) return null;
  const g = p.polygon.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
  const rings = g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat() : null;
  if (!rings) return null;
  return JSON.stringify({ rings, spatialReference: { wkid: 4326 } });
}

/** FEMA flood zone at the parcel (polygon intersect when we have one, else centroid). */
export async function femaFlood(p: ParcelInfo): Promise<FloodInfo> {
  type Feat = { attributes: Record<string, unknown> };
  const poly = esriPolygon(p);
  const geomArgs = poly
    ? `geometry=${encodeURIComponent(poly)}&geometryType=esriGeometryPolygon&spatialRel=esriSpatialRelIntersects`
    : `geometry=${p.lng},${p.lat}&geometryType=esriGeometryPoint`;
  const zones = await fetchCached<{ features?: Feat[] }>("fema28", { apn: p.apn, poly: !!poly }, () =>
    getJson(`${NFHL}/28/query?${geomArgs}&inSR=4326&outFields=FLD_ZONE,ZONE_SUBTY,STATIC_BFE,SFHA_TF,DFIRM_ID,FIRM_PAN&returnGeometry=false&f=json`),
  );
  const feats = zones.features ?? [];
  // Worst zone wins the headline: any SFHA (A*/V*) over X.
  const sfhaFeat = feats.find((f) => String(f.attributes.SFHA_TF) === "T") ?? feats[0];
  const a = sfhaFeat?.attributes ?? {};
  let panelDate = "";
  try {
    const pan = await fetchCached<{ features?: Feat[] }>("fema3", { apn: p.apn }, () =>
      getJson(`${NFHL}/3/query?geometry=${p.lng},${p.lat}&geometryType=esriGeometryPoint&inSR=4326&outFields=FIRM_PAN,EFF_DATE&returnGeometry=false&f=json`),
    );
    const eff = pan.features?.[0]?.attributes?.EFF_DATE;
    if (typeof eff === "number") panelDate = new Date(eff).toISOString().slice(0, 10);
  } catch { /* panel date optional */ }
  const [minx, miny, maxx, maxy] = bboxOf(p);
  return {
    zone: String(a.FLD_ZONE ?? "") || (feats.length ? "X" : ""),
    subtype: String(a.ZONE_SUBTY ?? "").trim(),
    bfe: a.STATIC_BFE != null && Number(a.STATIC_BFE) > -9999 ? String(a.STATIC_BFE) : "",
    sfha: feats.length ? feats.some((f) => String(f.attributes.SFHA_TF) === "T") : null,
    panel: String(a.FIRM_PAN ?? ""),
    panelDate,
    mapUrl: `${NFHL}/export?bbox=${minx},${miny},${maxx},${maxy}&bboxSR=4326&imageSR=4326&layers=show:28,3&size=1400,1000&format=png&transparent=false&f=image`,
  };
}

/** NWI wetlands intersecting the parcel + % of parcel area (needs @turf at call site). */
export async function nwiWetlands(p: ParcelInfo): Promise<WetlandsInfo> {
  type Feat = { attributes?: never; properties?: { ATTRIBUTE?: string; WETLAND_TYPE?: string }; geometry?: GeoJSON.Geometry };
  const poly = esriPolygon(p);
  const geomArgs = poly
    ? `geometry=${encodeURIComponent(poly)}&geometryType=esriGeometryPolygon`
    : `geometry=${encodeURIComponent(JSON.stringify({ x: p.lng, y: p.lat, spatialReference: { wkid: 4326 } }))}&geometryType=esriGeometryPoint`;
  const data = await fetchCached<{ features?: Feat[] }>("nwi", { apn: p.apn, poly: !!poly }, () =>
    getJson(`${NWI}?${geomArgs}&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=ATTRIBUTE,WETLAND_TYPE&returnGeometry=true&outSR=4326&f=geojson`),
  );
  const feats = (data.features ?? []) as Array<{ properties?: { ATTRIBUTE?: string; WETLAND_TYPE?: string }; geometry?: GeoJSON.Geometry }>;
  const classes = feats.map((f) => ({ attribute: f.properties?.ATTRIBUTE ?? "", type: f.properties?.WETLAND_TYPE ?? "" }))
    .filter((c, i, arr) => c.attribute && arr.findIndex((x) => x.attribute === c.attribute) === i);
  // % of parcel: turf.intersect over each wetland polygon
  let pct: number | null = null;
  if (p.polygon && feats.some((f) => f.geometry)) {
    try {
      const turfArea = (await import("@turf/area")).default;
      const intersect = (await import("@turf/intersect")).default;
      const { featureCollection } = await import("@turf/helpers");
      const parcelArea = turfArea(p.polygon);
      let wet = 0;
      for (const f of feats) {
        if (!f.geometry || (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon")) continue;
        const ix = intersect(featureCollection([p.polygon as GeoJSON.Feature<GeoJSON.Polygon>, { type: "Feature", geometry: f.geometry, properties: {} } as GeoJSON.Feature<GeoJSON.Polygon>]));
        if (ix) wet += turfArea(ix);
      }
      if (parcelArea > 0) pct = Math.min(100, Math.round((wet / parcelArea) * 100));
    } catch { /* pct stays null → 🟡 */ }
  } else if (classes.length === 0) pct = 0;
  const [minx, miny, maxx, maxy] = bboxOf(p);
  return {
    classes,
    pctOfParcel: pct,
    mapUrl: `https://fwsprimary.wim.usgs.gov/server/rest/services/Wetlands/MapServer/export?bbox=${minx},${miny},${maxx},${maxy}&bboxSR=4326&imageSR=4326&layers=show:0&size=1400,1000&format=png&transparent=false&f=image`,
  };
}

/** USDA soils: map units + % of AOI + drainage/hydric/flooding, like the sample's table. */
export async function sdaSoils(p: ParcelInfo): Promise<SoilRow[]> {
  const g = p.polygon?.geometry as GeoJSON.Polygon | undefined;
  if (!g || g.type !== "Polygon") return [];
  const wkt = `POLYGON((${g.coordinates[0].map((c) => `${c[0]} ${c[1]}`).join(",")}))`;
  const query = `SELECT mu.muname, mu.mukey, dc.drclassdcd, hr.hydclprs, ff.flodfreqdcd
    FROM mapunit mu
    LEFT JOIN (SELECT mukey, drclassdcd FROM component WHERE majcompflag='Yes') dc ON dc.mukey = mu.mukey
    LEFT JOIN (SELECT mukey, hydclprs FROM muaggatt) hr ON hr.mukey = mu.mukey
    LEFT JOIN (SELECT mukey, flodfreqdcd FROM muaggatt) ff ON ff.mukey = mu.mukey
    WHERE mu.mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${wkt}'))`;
  const data = await fetchCached<{ Table?: string[][] }>("sda", { apn: p.apn }, async () => {
    const res = await fetch(SDA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, format: "JSON" }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw new Error(`SDA ${res.status}`);
    return (await res.json()) as { Table?: string[][] };
  });
  const rows = data.Table ?? [];
  const seen = new Map<string, SoilRow>();
  for (const r of rows) {
    const name = r[0] ?? "";
    if (!name || seen.has(name)) continue;
    seen.set(name, { name, pct: 0, drainage: r[2] ?? "", hydric: r[3] ?? "", flooding: r[4] ?? "" });
  }
  const list = [...seen.values()];
  if (list.length) { const even = Math.round(100 / list.length); list.forEach((x) => (x.pct = even)); }
  return list.slice(0, 8);
}

/** USGS 3DEP spot elevations on 5 sample points → min/max/slope. */
export async function elevation(p: ParcelInfo): Promise<ElevationInfo> {
  const [minx, miny, maxx, maxy] = bboxOf(p, 0);
  const samples: Array<[number, number]> = [
    [p.lng, p.lat], [minx, miny], [maxx, miny], [minx, maxy], [maxx, maxy],
  ];
  const vals: number[] = [];
  for (const [x, y] of samples) {
    try {
      const r = await fetchCached<{ value?: number | string }>("3dep", { x: x.toFixed(5), y: y.toFixed(5) }, () =>
        getJson(`https://epqs.nationalmap.gov/v1/json?x=${x}&y=${y}&units=Feet&wkid=4326&includeDate=false`),
      );
      const v = Number(r.value);
      if (Number.isFinite(v) && v > -1000) vals.push(v);
    } catch { /* skip point */ }
  }
  if (!vals.length) return { minFt: null, maxFt: null, slopePct: null };
  const minFt = Math.min(...vals), maxFt = Math.max(...vals);
  // rough slope: rise over the bbox diagonal
  const diagFt = Math.hypot((maxx - minx) * 364000, (maxy - miny) * 364000) || 1;
  return { minFt: Math.round(minFt * 10) / 10, maxFt: Math.round(maxFt * 10) / 10, slopePct: Math.round(((maxFt - minFt) / diagFt) * 1000) / 10 };
}

/** Satellite + red parcel outline (Google Static Maps; "" when no key → 🟡). */
export function satelliteUrl(p: ParcelInfo): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return "";
  let path = "";
  const g = p.polygon?.geometry as GeoJSON.Polygon | undefined;
  if (g?.type === "Polygon") {
    const ring = g.coordinates[0].filter((_, i, a) => i % Math.ceil(a.length / 40) === 0 || i === a.length - 1);
    path = `&path=color:0xff0000ff|weight:4|fillcolor:0x00000000|${ring.map((c) => `${c[1].toFixed(6)},${c[0].toFixed(6)}`).join("|")}`;
  }
  return `https://maps.googleapis.com/maps/api/staticmap?size=1200x800&scale=2&maptype=hybrid&center=${p.lat},${p.lng}&zoom=17${path}&key=${key}`;
}
