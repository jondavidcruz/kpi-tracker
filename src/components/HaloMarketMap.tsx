"use client";
// 🎮 Halo-style territory map — a real Leaflet map with a fog-of-war feel. Markets glow when
// vetted buyers can take a deal there ("charted"); the owner can also DRAW territories on the
// map (areas we're marketing in / have pulled vs uncharted). Free + infra-light: Leaflet +
// Leaflet.draw load from cdnjs (not bundled into Vercel), satellite tiles from ESRI (no key),
// everything else from data the page already loaded + a small reserved-JSON territory store.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveTerritoryAction, deleteTerritoryAction } from "@/app/markets/actions";
import type { MarketView } from "@/components/MarketsBoard";
import type { Territory, TerrStatus } from "@/lib/map-territories";
import { gradeMarket, directMailReady } from "@/lib/market-grade";
import type { LeadPin } from "@/lib/lead-pins";
import type { BuyerCoverage } from "@/lib/buyer-coverage-map";

type Pt = { lat: number; lng: number };
export type ScanPt = { fips: string; name: string; state: string; score: number; tier: "target" | "watch" | "low"; price: number | null; yoy: number | null; dtp: number | null; landShare: number | null; lat: number; lng: number };

const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js";
const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css";
const DRAW_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js";
const DRAW_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css";
// Satellite basemap — FREE, NO API KEY (Carto now needs one). ESRI World Imagery = Halo look.
const SAT_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TILE_ATTR = "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";
// 🏷 Free ESRI reference overlays (same provider, no key) — place/city/county labels + boundaries,
// and roads/street names that fill in as you zoom, so the satellite is actually navigable.
const LABEL_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const ROAD_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";
const STREET_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";

const COORDS: Record<string, [number, number]> = {
  "Miami / Coral Gables": [25.72, -80.26], "Palm Beach / West Palm Beach": [26.71, -80.06],
  "Boca Raton / Fort Lauderdale": [26.3, -80.12], "Naples / Port Royal": [26.14, -81.79],
  "Orlando / Windermere / Winter Park": [28.5, -81.5], "Tampa Bay": [27.95, -82.46],
  "Sarasota / Lakewood Ranch": [27.36, -82.53], "Jacksonville / Ponte Vedra": [30.24, -81.45],
  "Jupiter Island / Vero Beach": [27.5, -80.33], "30A / Alys Beach (NW Florida)": [30.3, -86.0],
  // South Carolina (Jon 2026-11-06)
  "Bluffton / Hardeeville (Jasper)": [32.22, -80.98], "Hilton Head / Beaufort (Beaufort)": [32.33, -80.76],
  "Charleston / Mount Pleasant / Daniel Island": [32.8, -79.93], "Summerville / Nexton (Berkeley)": [33.0, -80.1],
  "Myrtle Beach / Grand Strand (Horry)": [33.69, -78.89], "Greenville / Greer (Upstate)": [34.85, -82.4],
  "Spartanburg (Upstate)": [34.95, -81.93], "Rock Hill / Fort Mill (York)": [35.0, -80.95],
  "Lake Keowee / Clemson (Oconee)": [34.75, -82.92], "Aiken (CSRA)": [33.56, -81.72],
  "Columbia / Lake Murray (Lexington)": [34.05, -81.3],
};
// 🏘 Zillow-style parcel layer — FREE, NO KEY, CORS-ok (verified). FDEP "South District" cadastral
// carries the full FL DOR tax-roll schema (use code, just value, acreage, last sale, owner) and
// covers our SW-FL waterfront core: Lee (Cape Coral), Charlotte (Punta Gorda), Collier (Marco/
// Naples). Only queried when zoomed in (≥ LOTS_MIN_ZOOM) with a small bbox. maxRecordCount 2000.
const FDEP_CADASTRAL = "https://services1.arcgis.com/nRHtyn3uE1kyzoYc/arcgis/rest/services/FDORCadastral_SouthDistrict/FeatureServer/0/query";
const LOTS_MIN_ZOOM = 14; // statewide parcels are 10M+ — only pull parcels at neighborhood zoom
const LOTS_VACANT_WHERE = "DOR_UC IN ('000','010','040') OR (DOR_UC >= '050' AND DOR_UC <= '069')";
// 🌫 Fog of war only appears once you've zoomed IN past this level — the zoomed-out map stays
// normal (no haze, no hard rectangle edges). At this zoom the fog's far edges are off-screen, so
// you only ever see the light haze + the clearings we've explored, never a boxy border (Jon 2026-11-10).
const FOG_MIN_ZOOM = 8;
const COV_COLOR: Record<string, string> = { never: "#64748b", clear: "#10b981", cooldown: "#f59e0b" };
const TERR_COLOR: Record<TerrStatus, string> = { pulled: "#f59e0b", marketing: "#3b82f6", target: "#10b981", avoid: "#ef4444" };
const TERR_LABEL: Record<TerrStatus, string> = { pulled: "✅ Explored (pulled)", marketing: "📣 Marketing now", target: "🎯 Target / to pull", avoid: "⛔ Avoid / saturated" };

function loadScript(src: string, css?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (css && !document.querySelector(`link[href="${css}"]`)) {
      const link = document.createElement("link"); link.rel = "stylesheet"; link.href = css; document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded) return resolve();
      existing.addEventListener("load", () => resolve()); existing.addEventListener("error", reject); return;
    }
    const s = document.createElement("script"); s.src = src;
    s.addEventListener("load", () => { s.dataset.loaded = "1"; resolve(); });
    s.addEventListener("error", reject); document.head.appendChild(s);
  });
}

export default function HaloMarketMap({ markets, buyerPoints = [], geocodeRemaining = 0, canEdit = false, territories = [], terrStats = {}, scanPoints = [], leadPins = [], leadZipsRemaining = 0, buyerCoverage = [] }: { markets: MarketView[]; buyerPoints?: Pt[]; geocodeRemaining?: number; canEdit?: boolean; territories?: Territory[]; terrStats?: Record<string, { leads: number; deals: number }>; scanPoints?: ScanPt[]; leadPins?: LeadPin[]; leadZipsRemaining?: number; buyerCoverage?: BuyerCoverage[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const dataRef = useRef<unknown>(null);   // markets + buyers + saved territories
  const fogRef = useRef<unknown>(null);    // 🌫 fog-of-war overlay (under the data layer)
  const lotsRef = useRef<unknown>(null);   // 🏘 live parcel/lot layer (on-zoom, free GIS)
  const lotsLoaderRef = useRef<(() => void) | null>(null); // trigger a parcel refetch from outside the map effect
  const showLotsRef = useRef(false);       // latest show.lots for the map event handler closure
  const showFogRef = useRef(true);         // latest show.fog for the zoom handler closure
  const syncFogRef = useRef<(() => void) | null>(null); // show/hide fog based on zoom, called from outside the map effect
  const didFitRef = useRef(false);         // only auto-fit the view ONCE — never on a layer toggle (Jon 2026-11-10)
  const hadSavedViewRef = useRef(false);   // restored a saved view → never auto-fit over it
  const drawnRef = useRef<unknown>(null);  // the in-progress drawn shape
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");
  // a just-drawn shape awaiting a name + status
  const [pending, setPending] = useState<[number, number][] | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<TerrStatus>("marketing");
  const [pulled, setPulled] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  // 🔎 Zillow-style autocomplete for the search box (Jon 2026-11-09).
  const [suggests, setSuggests] = useState<{ label: string; sub: string; lat: number; lon: number }[]>([]);
  const sugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sensible defaults so the map isn't overwhelming (Jon 2026-11-08): the key layers on, the two
  // busiest (cyan buyer dots + green buying-power polygons) off until toggled.
  const [show, setShow] = useState({ markets: true, buyers: false, terr: true, opp: true, leads: true, power: false, fog: true, lots: false });
  const [lotsMsg, setLotsMsg] = useState(""); // feedback for the on-zoom lot layer so you know WHY lots do/don't show
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkStatus, setBulkStatus] = useState<TerrStatus>("pulled");
  const [bulkBusy, setBulkBusy] = useState(false);
  // 🖥 Full-screen map (Jon 2026-11-09): use the native Fullscreen API so the map
  // fills the ENTIRE physical screen — scaling to a MacBook or a big monitor alike,
  // and hiding the browser chrome too — not just the browser window. Leaflet needs
  // invalidateSize + a tile redraw when the container resizes, or the satellite
  // tiles don't paint (that was the "black map" bug).
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fs, setFs] = useState(false);
  function enterFs() {
    const el = wrapRef.current as any;
    (el?.requestFullscreen ?? el?.webkitRequestFullscreen)?.call(el);
  }
  function exitFs() {
    (document.exitFullscreen ?? (document as any).webkitExitFullscreen)?.call(document);
  }
  useEffect(() => {
    const onChange = () => {
      const active = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setFs(active);
      const m = mapRef.current as any;
      // Re-measure + force the satellite tiles to reload at the new size (a few
      // passes so it catches after the fullscreen layout settles).
      [60, 220, 500].forEach((d) => setTimeout(() => {
        try { m?.invalidateSize?.(true); m?.eachLayer?.((l: any) => l?.redraw?.()); } catch { /* ignore */ }
      }, d));
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  async function bulkMark() {
    const places = bulkText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (!places.length) return;
    setBulkBusy(true); setGeoMsg(`Marking ${places.length} area${places.length > 1 ? "s" : ""}… (~1s each, free)`);
    try {
      const r = await fetch("/api/markets/bulk-mark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ places, status: bulkStatus }) });
      const j = await r.json();
      if (!r.ok) { setGeoMsg(j.error || "bulk-mark failed"); return; }
      setGeoMsg(`✅ Marked ${j.marked}/${j.total}${j.failed?.length ? ` · couldn't find: ${j.failed.slice(0, 5).join(", ")}` : ""}`);
      setBulkText(""); setBulkOpen(false); router.refresh();
    } catch { setGeoMsg("network error"); } finally { setBulkBusy(false); }
  }

  // 🔎 Search a county / ZIP → drop its boundary as a pending territory to name + save.
  async function searchArea() {
    const q = searchQ.trim();
    if (!q) return;
    setSearchBusy(true); setGeoMsg("");
    try {
      const r = await fetch(`/api/markets/geo-search?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (!r.ok) { setGeoMsg(j.error === "not found" ? `No boundary for "${q}" — try "Lee County, FL" or a 5-digit ZIP.` : "search failed"); return; }
      const ring = j.ring as [number, number][];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).L; const map = mapRef.current as any; const dg = drawnRef.current as any;
      if (L && dg) { dg.clearLayers(); const poly = L.polygon(ring, { color: "#38bdf8", weight: 2, dashArray: "5", fillOpacity: 0.15 }).addTo(dg); if (map) { try { map.fitBounds(poly.getBounds().pad(0.2)); } catch { /* */ } } }
      setPending(ring); setName(j.name || q); setStatus("pulled"); setSearchQ("");
    } catch { setGeoMsg("network error"); } finally { setSearchBusy(false); }
  }

  async function runGeocodeLeads() {
    setGeoBusy(true); setGeoMsg("Mapping lead ZIPs… (~25 at a time, cached)");
    try {
      const r = await fetch("/api/markets/geocode-leads", { method: "POST" });
      const j = await r.json();
      if (!r.ok) { setGeoMsg(j.error || "failed"); return; }
      setGeoMsg(`✅ Mapped ${j.cached}/${j.total} lead ZIPs${j.remaining ? ` · ${j.remaining} left — click again` : " · all mapped"}`);
      router.refresh();
    } catch { setGeoMsg("network error"); } finally { setGeoBusy(false); }
  }

  async function runGeocode() {
    setGeoBusy(true); setGeoMsg("Mapping buyer areas… (~25 at a time, cached forever)");
    try {
      const r = await fetch("/api/markets/geocode", { method: "POST" });
      const j = await r.json();
      if (!r.ok) { setGeoMsg(j.error || "failed"); return; }
      setGeoMsg(`✅ Mapped ${j.cached}/${j.total} buyer areas${j.remaining ? ` · ${j.remaining} left — click again` : " · all mapped"}`);
      router.refresh();
    } catch { setGeoMsg("network error"); } finally { setGeoBusy(false); }
  }

  async function saveDrawn() {
    if (!pending) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("name", name || "Untitled area"); fd.set("status", status); fd.set("points", JSON.stringify(pending)); fd.set("pulled", pulled);
    const res = await saveTerritoryAction(fd).catch(() => ({ ok: false }));
    setSaving(false);
    if (res.ok) { clearDrawn(); router.refresh(); } else setGeoMsg("⚠️ couldn't save the area");
  }
  function clearDrawn() {
    setPending(null); setName(""); setPulled("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dg = drawnRef.current as any; if (dg?.clearLayers) dg.clearLayers();
  }
  async function removeTerritory(id: string) {
    const fd = new FormData(); fd.set("id", id);
    await deleteTerritoryAction(fd).catch(() => {});
    router.refresh();
  }
  // Debounced city/county/ZIP suggestions as you type (Zillow-style).
  function onSearchChange(v: string) {
    setSearchQ(v);
    if (sugTimer.current) clearTimeout(sugTimer.current);
    if (v.trim().length < 3) { setSuggests([]); return; }
    sugTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/markets/geo-suggest?q=${encodeURIComponent(v.trim())}`);
        const j = await r.json();
        setSuggests(Array.isArray(j.items) ? j.items : []);
      } catch { setSuggests([]); }
    }, 280);
  }
  function pickSuggest(s: { label: string; lat: number; lon: number }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any;
    if (map && Number.isFinite(s.lat) && Number.isFinite(s.lon)) { try { map.flyTo([s.lat, s.lon], 10); } catch { /* ignore */ } }
    setSearchQ(s.label); setSuggests([]);
  }
  // Click a marked area in the list → fly the map to it (Jon 2026-11-09).
  function zoomToTerritory(points?: [number, number][]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L; const map = mapRef.current as any;
    if (!L || !map || !points || points.length < 2) return;
    try { map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 12 }); } catch { /* ignore */ }
  }

  // ── init the map ONCE (tiles + draw control) ──
  useEffect(() => {
    let cancelled = false;
    loadScript(LEAFLET_JS, LEAFLET_CSS)
      .then(() => (canEdit ? loadScript(DRAW_JS, DRAW_CSS) : Promise.resolve()))
      .then(() => {
        if (cancelled || !ref.current || mapRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = (window as any).L;
        // Restore the last view so marking an area (which refreshes) keeps you where you were
        // instead of snapping back to the full map (Jon 2026-11-08). Default = FL + SC in view.
        let center: [number, number] = [31.0, -81.5], zoom = 5;
        try { const sv = JSON.parse(sessionStorage.getItem("fo_map_view") || "null"); if (sv && Number.isFinite(sv.lat) && Number.isFinite(sv.lng) && Number.isFinite(sv.zoom)) { center = [sv.lat, sv.lng]; zoom = sv.zoom; hadSavedViewRef.current = true; } } catch { /* default */ }
        const map = L.map(ref.current, { center, zoom, scrollWheelZoom: true });
        mapRef.current = map;
        map.on("moveend zoomend", () => { try { sessionStorage.setItem("fo_map_view", JSON.stringify({ lat: map.getCenter().lat, lng: map.getCenter().lng, zoom: map.getZoom() })); } catch { /* ok */ } });
        // 🗺 Base layers (flip Satellite ↔ Streets) + free ESRI label/road overlays on top. zIndex
        // keeps the base below the labels so switching base never covers them (Jon 2026-11-08).
        const satBase = L.tileLayer(SAT_TILES, { attribution: TILE_ATTR, maxZoom: 18, zIndex: 1 });
        const streetBase = L.tileLayer(STREET_TILES, { attribution: TILE_ATTR, maxZoom: 18, zIndex: 1 });
        const roadsOv = L.tileLayer(ROAD_TILES, { maxZoom: 18, zIndex: 2 });
        const labelsOv = L.tileLayer(LABEL_TILES, { maxZoom: 18, zIndex: 3 });
        // 🗺 Census TIGERweb boundary overlays (free, no key) — toggle county / city / ZIP
        // outlines so you can see where the lines delineate as you zoom (Jon 2026-11-09).
        // (Neighborhoods aren't official public boundaries, so they're not available.)
        const TIGER_WMS = "https://tigerweb.geo.census.gov/arcgis/services/TIGERweb/tigerWMS_Current/MapServer/WMSServer";
        const wms = (layers: string) => L.tileLayer.wms(TIGER_WMS, { layers, format: "image/png", transparent: true, maxZoom: 18, opacity: 0.85, zIndex: 4 });
        const countyBounds = wms("11");   // Counties
        const cityBounds = wms("49");     // Incorporated Places (cities)
        const zipBounds = wms("77");      // 2020 Census ZIP Code Tabulation Areas
        satBase.addTo(map); roadsOv.addTo(map); labelsOv.addTo(map);
        L.control.layers(
          { "🛰 Satellite": satBase, "🗺 Streets": streetBase },
          { "🏷 Place labels": labelsOv, "🛣 Roads / streets": roadsOv, "▫️ County lines": countyBounds, "▫️ City lines": cityBounds, "▫️ ZIP code lines": zipBounds },
          { position: "topleft", collapsed: true },
        ).addTo(map);
        fogRef.current = L.layerGroup().addTo(map); // 🌫 fog sits UNDER the data markers
        lotsRef.current = L.layerGroup().addTo(map); // 🏘 parcels above fog, below the data markers

        // 🏘 On-zoom parcel layer — pulls vacant lots (and flags recent sales) from the free FDEP
        // cadastral for the current viewport, debounced, only when zoomed in + toggled on. Failures
        // (CORS/offline/too-many) degrade silently to an empty layer — never breaks the map.
        let lotsTimer: ReturnType<typeof setTimeout> | null = null;
        let lotsReqId = 0;
        const loadLots = async () => {
          const grp = lotsRef.current as any; if (!grp) return;
          if (!showLotsRef.current) { grp.clearLayers(); setLotsMsg(""); return; }
          if (map.getZoom() < LOTS_MIN_ZOOM) { grp.clearLayers(); setLotsMsg("🔍 Zoom in to street level (SW-FL: Cape Coral · Punta Gorda · Naples) to load lots"); return; }
          const b = map.getBounds();
          const env = { xmin: b.getWest(), ymin: b.getSouth(), xmax: b.getEast(), ymax: b.getNorth(), spatialReference: { wkid: 4326 } };
          const url = `${FDEP_CADASTRAL}?where=${encodeURIComponent(LOTS_VACANT_WHERE)}&geometry=${encodeURIComponent(JSON.stringify(env))}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${encodeURIComponent("PARCEL_ID,DOR_UC,JV,LND_SQFOOT,SALE_PRC1,SALE_YR1,SALE_MO1,OWN_NAME")}&returnGeometry=true&outSR=4326&resultRecordCount=1200&f=geojson`;
          const myReq = ++lotsReqId;
          setLotsMsg("Loading lots…");
          try {
            const res = await fetch(url);
            const gj = await res.json();
            if (myReq !== lotsReqId) return; // a newer pan/zoom superseded this one
            grp.clearLayers();
            const feats = Array.isArray(gj?.features) ? gj.features : [];
            if (!feats.length) { setLotsMsg("No vacant lots in view — this layer covers SW-FL (Lee · Charlotte · Collier) only"); return; }
            setLotsMsg(`🏘 ${feats.length} vacant/sold lots in view · blue = vacant, amber = sold ≤2 yrs`);
            const thisYear = new Date().getFullYear();
            L.geoJSON(gj, {
              style: (feat: any) => {
                const p = feat.properties || {};
                const sold = (p.SALE_YR1 || 0) >= thisYear - 2 && (p.SALE_PRC1 || 0) > 1000;
                const c = sold ? "#f59e0b" : "#38bdf8";
                return { color: c, weight: 1, fillColor: c, fillOpacity: sold ? 0.28 : 0.12 };
              },
              onEachFeature: (feat: any, layer: any) => {
                const p = feat.properties || {};
                const ac = p.LND_SQFOOT ? (p.LND_SQFOOT / 43560).toFixed(2) : "—";
                const sale = p.SALE_YR1 && p.SALE_PRC1 > 1000 ? `🏷 Last sale ${p.SALE_MO1 || ""}/${p.SALE_YR1}: <b>$${Math.round(p.SALE_PRC1).toLocaleString()}</b>` : "🏷 No recent arm's-length sale";
                const uc = p.DOR_UC === "000" ? "Vacant residential" : p.DOR_UC === "010" ? "Vacant commercial" : p.DOR_UC === "040" ? "Vacant industrial" : /^0[5-6]\d$/.test(p.DOR_UC) ? "Agricultural" : `Use ${p.DOR_UC}`;
                layer.bindPopup(`<div style="font:12px system-ui;min-width:170px"><b>${uc}</b><br>💰 Just value: <b>$${Math.round(p.JV || 0).toLocaleString()}</b><br>📐 ${ac} ac<br>${sale}<br>👤 ${p.OWN_NAME || "—"}<br><span style="color:#64748b">Parcel ${p.PARCEL_ID || ""}</span></div>`);
              },
            }).addTo(grp);
          } catch { try { (lotsRef.current as any)?.clearLayers(); } catch { /* ok */ } setLotsMsg("Couldn't load lots here — pan or zoom to retry"); }
        };
        const scheduleLots = () => { if (lotsTimer) clearTimeout(lotsTimer); lotsTimer = setTimeout(loadLots, 450); };
        lotsLoaderRef.current = scheduleLots;
        map.on("moveend zoomend", scheduleLots);

        // 🌫 Fog sync — the haze ONLY appears once you've zoomed IN past FOG_MIN_ZOOM. Zoomed out, the
        // fog layer is removed entirely so the map looks normal (no haze, no boxy rectangle edge).
        // Toggling layers never rebuilds this — it only add/removes the prebuilt layer, so it's fast.
        const syncFog = () => {
          const fg = fogRef.current as any; if (!fg) return;
          const want = showFogRef.current && map.getZoom() >= FOG_MIN_ZOOM;
          if (want && !map.hasLayer(fg)) map.addLayer(fg);
          else if (!want && map.hasLayer(fg)) map.removeLayer(fg);
        };
        syncFogRef.current = syncFog;
        map.on("zoomend", syncFog);
        syncFog();

        dataRef.current = L.featureGroup().addTo(map);
        if (canEdit) {
          const drawn = L.featureGroup().addTo(map); drawnRef.current = drawn;
          if (L.Control?.Draw) {
          const ctl = new L.Control.Draw({
            position: "topright",
            draw: { polygon: { showArea: false }, rectangle: {}, polyline: false, circle: false, marker: false, circlemarker: false },
            edit: { featureGroup: drawn, edit: false, remove: false },
          });
          map.addControl(ctl);
          map.on(L.Draw.Event.CREATED, (e: { layer: { getLatLngs: () => { lat: number; lng: number }[][]; addTo: (g: unknown) => void } }) => {
            drawn.clearLayers();
            e.layer.addTo(drawn);
            const ring = (e.layer.getLatLngs()[0] || []).map((p) => [p.lat, p.lng] as [number, number]);
            setPending(ring);
          });
          }
        }
        setReady(true);
      }).catch(() => { /* CDN blocked — card view still works */ });
    return () => {
      cancelled = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = mapRef.current as any; if (m?.remove) { m.remove(); mapRef.current = null; dataRef.current = null; drawnRef.current = null; }
    };
  }, [canEdit]);

  // 🏘 Keep the parcel layer in sync with its toggle — refetch when turned on, clear when off.
  useEffect(() => {
    showLotsRef.current = show.lots;
    if (show.lots) lotsLoaderRef.current?.();
    else { try { (lotsRef.current as any)?.clearLayers?.(); } catch { /* ok */ } setLotsMsg(""); }
  }, [show.lots, ready]);

  // 🌫 Keep the fog toggle in sync — add/remove the prebuilt haze (honoring the zoom gate), no rebuild.
  useEffect(() => {
    showFogRef.current = show.fog;
    syncFogRef.current?.();
  }, [show.fog, ready]);

  // ── redraw data layers whenever the data changes (markets, buyers, territories) ──
  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L; const map = mapRef.current as any; const group = dataRef.current as any;
    if (!L || !map || !group) return;
    group.clearLayers();

    // 🌫 FOG OF WAR — the whole region sits under a light haze; it LIFTS (clears to full satellite)
    // everywhere we've actually explored: territories we've pulled, ZIPs with seller leads in our
    // CRM, and known markets with buyers/deals. Unexplored stays lightly fogged (not hidden) so Jon
    // can still see the terrain but instantly reads what's charted vs blank. Kept in its own layer
    // (not `group`) so it never distorts the auto-fit bounds. Built from data we already have — free.
    const fog = fogRef.current as any;
    if (fog) {
      fog.clearLayers();
      if (show.fog) {
        const ring = (lat: number, lng: number, rd: number, seg = 28) => {
          const pts: [number, number][] = [];
          const k = Math.max(0.2, Math.cos((lat * Math.PI) / 180)); // keep holes round
          for (let i = 0; i < seg; i++) { const a = (i / seg) * 2 * Math.PI; pts.push([lat + rd * Math.sin(a), lng + (rd * Math.cos(a)) / k]); }
          return pts;
        };
        const holes: [number, number][][] = [];
        // explored: every territory we've marked/pulled (use its real shape)
        for (const t of territories) {
          if (!t.points || t.points.length < 3) continue;
          holes.push(t.points.map((p: any) => (Array.isArray(p) ? [p[0], p[1]] : [p.lat, p.lng])) as [number, number][]);
        }
        // explored: ZIPs where seller leads have landed in our CRM (bigger clearing where we closed)
        for (const lp of leadPins) holes.push(ring(lp.lat, lp.lng, lp.deals > 0 ? 0.11 : 0.07));
        // explored: known markets (buyers, leads, or deals here = we've engaged it)
        for (const v of markets) {
          const c = COORDS[v.m.name]; if (!c) continue;
          if (v.buyerCount > 0 || v.leads > 0 || v.deals > 0) holes.push(ring(c[0], c[1], v.deals > 0 ? 0.2 : 0.12));
        }
        // one big donut: region rectangle minus every explored hole. Light haze, click-through.
        const outer: [number, number][] = [[20, -90], [40, -90], [40, -74], [20, -74]];
        L.polygon([outer, ...holes], { stroke: false, fillColor: "#dbeafe", fillOpacity: 0.4, interactive: false, className: "fo-fog" }).addTo(fog);
      }
      syncFogRef.current?.(); // honor the zoom gate after a rebuild (fog shows only when zoomed in)
    }

    // 💪 Buying-power layer (base) — counties where vetted buyers want to buy, as green boundaries.
    if (show.power) for (const bc of buyerCoverage) {
      const op = Math.min(0.4, 0.12 + bc.buyers * 0.05);
      const poly = L.polygon(bc.ring, { color: "#16a34a", weight: 1.5, fillColor: "#22c55e", fillOpacity: op }).addTo(group);
      poly.bindTooltip(`💪 ${bc.name.replace(/ County$/, "")} — ${bc.buyers} buyer${bc.buyers > 1 ? "s" : ""}`, { sticky: true });
      poly.bindPopup(`<div style="font:12px system-ui"><b>💪 ${bc.name}</b><br><b>${bc.buyers}</b> vetted buyer${bc.buyers > 1 ? "s" : ""} want this market${bc.newMarket ? " · 🆕 new" : ""}</div>`);
    }

    if (show.terr) for (const t of territories) {
      if (!t.points || t.points.length < 3) continue;
      const poly = L.polygon(t.points, { color: TERR_COLOR[t.status], weight: 2, fillColor: TERR_COLOR[t.status], fillOpacity: 0.22 }).addTo(group);
      const st = terrStats[t.id];
      const tg = gradeMarket({ leads: st?.leads ?? 0, deals: st?.deals ?? 0, pulled: t.pulled });
      const statLine = st && (st.leads || st.deals) ? ` · 📥 ${st.leads} leads · 🏆 ${st.deals} deals` : "";
      poly.bindTooltip(`${TERR_LABEL[t.status]} — ${t.name} · ${tg.grade}${statLine}`, { sticky: true });
      poly.bindPopup(`<div style="font:12px system-ui"><b>${TERR_LABEL[t.status]}</b><br>${t.name}${t.at ? `<br>📅 Marked ${t.at.slice(0, 10)}${t.by ? ` by ${t.by.split(" ")[0]}` : ""}` : ""}${t.pulled ? `<br>🎯 <b>${t.pulled.toLocaleString()}</b> leads pulled` : ""}<br>🏅 <b style="color:${tg.color}">${tg.label}</b>${st ? `<br>📥 <b>${st.leads}</b> leads · 🏆 <b>${st.deals}</b> deals in our CRM here` : ""}</div>`);
    }
    if (show.buyers) for (const p of buyerPoints) L.circleMarker([p.lat, p.lng], { radius: 9, stroke: false, fillColor: "#22d3ee", fillOpacity: 0.22 }).addTo(group);

    // 📍 Lead pins — seller leads by ZIP; a gold ⭐ marks ZIPs where we've CLOSED a land deal.
    if (show.leads) for (const lp of leadPins) {
      const g = gradeMarket({ leads: lp.leads, deals: lp.deals });
      const hasDeal = lp.deals > 0;
      const rad = 4 + Math.min(10, Math.log2(lp.leads + 1) * 2.2);
      const mk = L.circleMarker([lp.lat, lp.lng], { radius: rad, color: hasDeal ? "#fbbf24" : "#ffffff", weight: hasDeal ? 2.5 : 1, fillColor: hasDeal ? "#f59e0b" : "#38bdf8", fillOpacity: 0.85 }).addTo(group);
      mk.bindPopup(`<div style="font:12px system-ui"><b>ZIP ${lp.zip}</b><br>📥 <b>${lp.leads}</b> seller lead${lp.leads > 1 ? "s" : ""}${hasDeal ? `<br>⭐ <b>${lp.deals}</b> land deal${lp.deals > 1 ? "s" : ""} CLOSED here` : ""}<br>🏅 <b style="color:${g.color}">${g.label}</b></div>`);
    }

    // 🔎 Opportunity layer — Market Finder county scores (public data). Show target + watch only
    // to keep the map clean; color by tier, size by score. Diamond-ish via a square-ish marker.
    const OPP_COLOR = { target: "#10b981", watch: "#f59e0b", low: "#94a3b8" } as const;
    if (show.opp) for (const s of scanPoints) {
      if (s.tier === "low") continue;
      const rad = 6 + (s.score / 100) * 14;
      const mk = L.circleMarker([s.lat, s.lng], { radius: rad, color: "#ffffff", weight: 1.5, fillColor: OPP_COLOR[s.tier], fillOpacity: 0.8 }).addTo(group);
      const landLine = s.landShare != null ? `<div>🏕 Land ≥$100k: <b>${Math.round(s.landShare * 100)}%</b> of parcels</div>` : "";
      mk.bindPopup(
        `<div style="font:12px system-ui;min-width:180px"><div style="font-weight:800;font-size:13px">${s.name} <span style="color:#64748b;font-weight:600">${s.state}</span></div>` +
        `<div style="margin:3px 0"><b style="font-size:15px">${s.score}</b> opportunity · ${s.tier === "target" ? "🎯 Target" : "👀 Watch"}</div>` +
        `<div>🏠 Median ${s.price != null ? "$" + Math.round(s.price).toLocaleString() : "—"}${s.yoy != null ? ` · ${s.yoy >= 0 ? "+" : ""}${s.yoy}% YoY` : ""}</div>` +
        `<div>⏱ ${s.dtp != null ? "~" + Math.round(s.dtp) + " days to pending" : "—"}</div>${landLine}</div>`);
      mk.bindTooltip(`${s.name} · ${s.score}`, { direction: "top", className: "fo-map-label", offset: [0, -rad] });
    }

    const placed = show.markets ? markets.filter((v) => COORDS[v.m.name]) : [];
    const maxDeals = Math.max(1, ...placed.map((v) => v.deals));
    for (const v of placed) {
      const [lat, lng] = COORDS[v.m.name];
      const charted = v.buyerCount > 0;
      if (charted) L.circleMarker([lat, lng], { radius: 20 + Math.min(10, v.buyerCount * 2), stroke: false, fillColor: "#22d3ee", fillOpacity: 0.12 }).addTo(group);
      const r = 7 + (v.deals / maxDeals) * 13;
      const cov = v.coverage.status === "never" ? "Never pulled" : v.coverage.status === "clear" ? `Clear to pull · last ${v.coverage.lastPull}` : `Cooldown ${v.coverage.cooldownLeft}d`;
      const marker = L.circleMarker([lat, lng], { radius: r, color: "#ffffff", weight: 1.5, fillColor: COV_COLOR[v.coverage.status] ?? "#64748b", fillOpacity: charted ? 0.9 : 0.4 }).addTo(group);
      const mg = gradeMarket({ leads: v.leads, deals: v.deals });
      marker.bindPopup(
        `<div style="font:12px system-ui;min-width:170px"><div style="font-weight:800;font-size:13px">${v.m.name}${v.m.waterfront ? " 🌊" : ""}</div>` +
        `<div style="color:#475569">${v.m.region} · W${v.m.wealth}/B${v.m.business}</div>` +
        `<div style="margin-top:4px">🏅 <b style="color:${mg.color}">${mg.label}</b></div>` +
        `<div style="margin-top:4px">${charted ? `🟢 <b>${v.buyerCount} buyer${v.buyerCount > 1 ? "s" : ""}</b> can move deals here` : "⚪ <b>Uncharted</b> — no buyers yet"}</div>` +
        `<div>📍 ${cov}</div><div>🏷 ${v.deals} deals · ${v.leads} leads · 30/60/180: ${v.momentum.d30}/${v.momentum.d60}/${v.momentum.d180}</div></div>`);
      marker.bindTooltip(v.m.name.split(" / ")[0], { permanent: true, direction: "top", className: "fo-map-label", offset: [0, -r] });
    }
    // Auto-fit the view ONLY once on first load, and only if we didn't restore a saved view. Never
    // on a layer toggle — toggling a layer must keep you exactly where you are (Jon 2026-11-10).
    if (!didFitRef.current && !hadSavedViewRef.current) {
      try { map.fitBounds(group.getBounds().pad(0.15)); didFitRef.current = true; } catch { /* no markers */ }
    }
  }, [ready, markets, buyerPoints, territories, show, scanPoints, leadPins, buyerCoverage]);

  // Re-measure the map once it's ready (container has its real size by then).
  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any;
    const t = setTimeout(() => { try { map?.invalidateSize?.(); } catch { /* */ } }, 220);
    return () => clearTimeout(t);
  }, [ready]);

  const charted = markets.filter((v) => v.buyerCount > 0).length;
  // 📬 Markets/areas with PROVEN inbound response (A/B) — the ones worth the direct-mail spend.
  const dmReady = [
    ...markets.map((v) => ({ name: v.m.name.split(" / ")[0], g: gradeMarket({ leads: v.leads, deals: v.deals }) })),
    ...territories.map((t) => ({ name: t.name, g: gradeMarket({ leads: terrStats[t.id]?.leads ?? 0, deals: terrStats[t.id]?.deals ?? 0, pulled: t.pulled }) })),
  ].filter((x) => directMailReady(x.g.grade)).sort((a) => (a.g.grade === "A" ? -1 : 1));
  return (
    <div className="rounded-2xl bg-slate-900 p-2 shadow-sm ring-1 ring-slate-800">
      <style>{`.fo-map-label{background:transparent;border:none;box-shadow:none;color:#f1f5f9;font:700 10px system-ui;text-shadow:0 1px 3px #000}.leaflet-popup-content{margin:10px 12px}.fo-map-wrap:fullscreen,.fo-map-wrap:-webkit-full-screen{width:100vw;height:100vh}.fo-map-wrap:fullscreen .fo-map-canvas,.fo-map-wrap:-webkit-full-screen .fo-map-canvas{height:100vh!important;min-height:0!important;border-radius:0!important}`}</style>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] font-semibold text-slate-300">
        <span className="text-slate-400">Legend:</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#10b981" }} /> Target market</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#f59e0b" }} /> Watch market</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#38bdf8" }} /> Seller lead</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-amber-300" style={{ background: "#f59e0b" }} /> Closed deal</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: "#3b82f6", opacity: 0.55 }} /> Explored area</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: "#dbeafe", opacity: 0.5 }} /> 🌫 Unexplored — zoom in (fog lifts as we explore)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm ring-1 ring-sky-400" style={{ background: "#38bdf8", opacity: 0.4 }} /> 🏘 Vacant lot</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm ring-1 ring-amber-400" style={{ background: "#f59e0b", opacity: 0.5 }} /> Recently sold lot</span>
        <span className="text-slate-500">· bigger = more</span>
        <button onClick={enterFs} className="ml-auto rounded-full bg-slate-700/70 px-2.5 py-1 font-bold text-slate-100 ring-1 ring-slate-600 hover:bg-slate-600">⛶ Full screen</button>
        <span className="rounded-full bg-cyan-500/20 px-2.5 py-1 font-bold text-cyan-300 ring-1 ring-cyan-500/30">{charted}/{markets.length} w/ buyers</span>
      </div>
      <div className="mb-1 flex flex-wrap items-center gap-2 px-1 text-[11px]">
        <span className="font-bold text-slate-400">Layers:</span>
        {(["fog", "lots", "opp", "markets", "buyers", "power", "leads", "terr"] as const).map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-1 text-slate-300"><input type="checkbox" checked={show[k]} onChange={(e) => setShow((s) => ({ ...s, [k]: e.target.checked }))} /> {k === "fog" ? "🌫 Fog of war" : k === "lots" ? "🏘 Lots (zoom in)" : k === "opp" ? "🔎 Opportunity" : k === "markets" ? "🎯 Markets" : k === "buyers" ? "🟢 Buyers" : k === "power" ? "💪 Buying power" : k === "leads" ? "📍 Leads" : "🖍 My areas"}</label>
        ))}
        {canEdit && <button onClick={runGeocode} disabled={geoBusy} className="rounded-lg bg-cyan-600 px-2.5 py-1 font-bold text-white hover:bg-cyan-700 disabled:opacity-50">{geoBusy ? "Mapping…" : geocodeRemaining > 0 ? `🔄 Map buyer areas (${geocodeRemaining} left)` : "🔄 Re-map buyers"}</button>}
        {canEdit && leadZipsRemaining > 0 && <button onClick={runGeocodeLeads} disabled={geoBusy} className="rounded-lg bg-sky-600 px-2.5 py-1 font-bold text-white hover:bg-sky-700 disabled:opacity-50">{geoBusy ? "Mapping…" : `📍 Map lead locations (${leadZipsRemaining} left)`}</button>}
        {geoMsg && <span className="text-slate-400">{geoMsg}</span>}
        {show.lots && lotsMsg && <span className="font-semibold text-sky-300">{lotsMsg}</span>}
      </div>
      {canEdit && (
        <div className="mb-1 flex flex-wrap items-center gap-2 px-1 text-[11px]">
          <span className="font-bold text-slate-400">🔎 Mark explored:</span>
          <div className="relative">
            <input value={searchQ} onChange={(e) => onSearchChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setSuggests([]); searchArea(); } }} placeholder="Type a city, county, or ZIP — e.g. Cape Coral, FL" className="w-72 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-white" />
            {suggests.length > 0 && (
              <div className="absolute left-0 top-full z-[600] mt-1 w-80 overflow-hidden rounded-lg border border-slate-600 bg-slate-900 shadow-xl">
                {suggests.map((s, i) => (
                  <button key={i} type="button" onClick={() => pickSuggest(s)} className="block w-full px-3 py-1.5 text-left text-[12px] text-white hover:bg-slate-700">
                    <span className="font-semibold">{s.label}</span>{s.sub && <span className="ml-1 text-slate-400">· {s.sub}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={searchArea} disabled={searchBusy} className="rounded-lg bg-cyan-600 px-2.5 py-1 font-bold text-white hover:bg-cyan-700 disabled:opacity-50">{searchBusy ? "Searching…" : "🔎 Find & mark"}</button>
          <button onClick={() => setBulkOpen((b) => !b)} className="rounded-lg bg-slate-200 px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-300">📋 Bulk-mark ZIPs</button>
          <span className="text-slate-400">or draw with the ▱/⬠ tools (top-right).</span>
        </div>
      )}
      {canEdit && bulkOpen && (
        <div className="mb-1 flex flex-wrap items-start gap-2 rounded-xl bg-slate-800 px-2 py-2 text-[11px] ring-1 ring-slate-700">
          <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={2} placeholder="Paste ZIPs or counties, comma or newline separated — e.g. 33914, 34102, Lee County FL" className="w-80 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-white" />
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as TerrStatus)} className="rounded border border-slate-600 bg-slate-900 px-1.5 py-1 font-semibold text-white">
            <option value="pulled">📥 Pulled leads</option>
            <option value="marketing">📣 Marketing now</option>
            <option value="target">🎯 Target / to pull</option>
            <option value="avoid">⛔ Avoid / saturated</option>
          </select>
          <button onClick={bulkMark} disabled={bulkBusy} className="rounded-lg bg-emerald-600 px-3 py-1 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{bulkBusy ? "Marking…" : "Mark all"}</button>
          <span className="text-slate-400">up to 40 at a time</span>
        </div>
      )}
      {pending && (
        <div className="mb-1 flex flex-wrap items-center gap-2 rounded-xl bg-slate-800 px-2 py-2 text-[12px] ring-1 ring-slate-700">
          <span className="font-bold text-white">Name this area:</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cape Coral SW zips" className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-white" />
          <select value={status} onChange={(e) => setStatus(e.target.value as TerrStatus)} className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-white">
            <option value="marketing">📣 Marketing now</option>
            <option value="pulled">📥 Pulled leads</option>
            <option value="target">🎯 Target / to pull</option>
            <option value="avoid">⛔ Avoid / saturated</option>
          </select>
          <label className="flex items-center gap-1 text-slate-300"># leads pulled <input value={pulled} onChange={(e) => setPulled(e.target.value.replace(/[^\d]/g, ""))} placeholder="opt." className="w-16 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-white" /></label>
          <button onClick={saveDrawn} disabled={saving} className="rounded-lg bg-emerald-600 px-3 py-1 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? "Saving…" : "Save area"}</button>
          <button onClick={clearDrawn} className="rounded-lg bg-slate-600 px-3 py-1 font-bold text-white hover:bg-slate-500">Cancel</button>
        </div>
      )}
      {dmReady.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-emerald-900/30 px-2 py-1.5 text-[11px] ring-1 ring-emerald-700/40">
          <span className="font-bold text-emerald-300">📬 Direct-mail ready ({dmReady.length}):</span>
          {dmReady.slice(0, 12).map((x, i) => (
            <span key={i} className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: `${x.g.color}dd` }}>{x.g.grade} {x.name}</span>
          ))}
          <span className="text-emerald-400/70">— proven response, worth the direct-mail spend</span>
        </div>
      )}
      <div ref={wrapRef} className="fo-map-wrap relative">
        <div ref={ref} className="fo-map-canvas h-[86vh] min-h-[600px] w-full overflow-hidden rounded-xl" style={{ background: "#0b1220" }} />
        {fs && (
          <button onClick={exitFs} className="absolute right-3 top-3 z-[1200] rounded-lg bg-slate-900/90 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/25 hover:bg-slate-800">✕ Exit full screen (Esc)</button>
        )}
      </div>
      {territories.length > 0 && (
        <div className="mt-2 px-1">
          <div className="mb-1 text-[11px] font-bold text-slate-400">📍 Your marked areas ({territories.length}) — click one to zoom to it</div>
          <div className="flex flex-wrap gap-1.5">
            {territories.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: `${TERR_COLOR[t.status]}cc` }}>
                <button onClick={() => zoomToTerritory(t.points)} title="Zoom to this area" className="inline-flex cursor-pointer items-center gap-1 hover:underline">
                  {TERR_LABEL[t.status].split(" ")[0]} {t.name}
                  {terrStats[t.id] && (terrStats[t.id].leads > 0 || terrStats[t.id].deals > 0) && <span className="rounded bg-black/25 px-1 text-[10px]">📥{terrStats[t.id].leads} 🏆{terrStats[t.id].deals}</span>}
                </button>
                {canEdit && <button onClick={() => removeTerritory(t.id)} title="Delete" className="ml-0.5 text-white/80 hover:text-white">×</button>}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="mt-1 px-1 text-[10px] text-slate-500">Click a market for details. Glowing = buyers there. Draw areas to paint where you&apos;re marketing / have pulled vs open territory.</p>
    </div>
  );
}
