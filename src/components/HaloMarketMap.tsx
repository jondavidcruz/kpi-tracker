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
export type LandTrends = { landSold: { d30: number; d90: number; d180: number }; newConSold: { d30: number; d90: number; d180: number }; landPending: number; newConPending: number; yoyLandPct: number | null; asOf: string };
export type ScanPt = { fips: string; name: string; state: string; score: number; tier: "target" | "watch" | "low"; price: number | null; yoy: number | null; dtp: number | null; landShare: number | null; trends?: LandTrends | null; buyers?: number; ring?: number; residual?: number | null; testMarket?: boolean; lat: number; lng: number };
export type ClosedDeal = { lat: number; lng: number; address: string; soldPrice: number | null; fee: number | null; buyer: string; soldDate: string; dealType: string };

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
// 🏘 Zillow-style parcel layer — FREE, NO KEY, CORS-ok (verified end-to-end 2026-11-11). The FL
// Statewide Cadastral (CADASTRAL_DOR) carries the full DOR tax-roll schema — use code, just value,
// acreage, last sale, owner, site address, land value — for EVERY Florida county (Port St Lucie,
// Palm Beach, St Pete, Orlando, Palm Bay, Tampa… not just SW-FL anymore). Only queried when zoomed
// in (≥ LOTS_MIN_ZOOM) with a small bbox. maxRecordCount 2000, so we gate to neighborhood zoom.
const FDEP_CADASTRAL = "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query";
const LOTS_MIN_ZOOM = 15; // statewide parcels are 10M+ — pull only at neighborhood zoom so we don't hit the 2000 cap
const LOTS_VACANT_WHERE = "DOR_UC IN ('000','010','040') OR (DOR_UC >= '050' AND DOR_UC <= '069')";
// 🧾 Rich county-record popup for a single parcel (used when a pulled-list pin is clicked — we look
// the lot up live from the statewide cadastral for FREE: owner, assessed/just value, land value,
// acreage, last sale, site address). Keeps a pulled lead from being just an anonymous purple dot.
function lotRecordHtml(p: Record<string, unknown>): string {
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  const uc = p.DOR_UC === "000" ? "Vacant residential" : p.DOR_UC === "010" ? "Vacant commercial" : p.DOR_UC === "040" ? "Vacant industrial" : /^0[5-6]\d$/.test(String(p.DOR_UC || "")) ? "Agricultural" : p.DOR_UC ? `Use code ${p.DOR_UC}` : "Parcel";
  const ac = num(p.LND_SQFOOT) ? (num(p.LND_SQFOOT) / 43560).toFixed(2) : "—";
  const sale = num(p.SALE_YR1) && num(p.SALE_PRC1) > 1000 ? `🏷 Last sale ${p.SALE_MO1 || ""}/${p.SALE_YR1}: <b>$${Math.round(num(p.SALE_PRC1)).toLocaleString()}</b>` : "🏷 No recent arm's-length sale";
  const addr = p.PHY_ADDR1 ? `${String(p.PHY_ADDR1).trim()}${p.PHY_CITY ? ", " + String(p.PHY_CITY).trim() : ""}` : "";
  const land = num(p.LND_VAL) > 0 ? `<div>🌱 Land value: <b>$${Math.round(num(p.LND_VAL)).toLocaleString()}</b></div>` : "";
  return `<div style="font:12px system-ui;min-width:195px"><div style="font-weight:800">📄 Pulled lead · ${uc}</div>${addr ? `<div style="color:#334155">📍 ${addr}</div>` : ""}<div style="margin-top:3px">💰 Assessed (just) value: <b>$${Math.round(num(p.JV)).toLocaleString()}</b></div>${land}<div>📐 ${ac} ac</div><div>${sale}</div><div>👤 ${p.OWN_NAME || "—"}</div><div style="color:#64748b">Parcel ${p.PARCEL_ID || ""}</div></div>`;
}
// 🌫 Fog of war only appears once you've zoomed IN past this level — the zoomed-out map stays
// normal (no haze, no hard rectangle edges). At this zoom the fog's far edges are off-screen, so
// you only ever see the light haze + the clearings we've explored, never a boxy border (Jon 2026-11-10).
const FOG_MIN_ZOOM = 8;
const COV_COLOR: Record<string, string> = { never: "#64748b", clear: "#10b981", cooldown: "#f59e0b" };
const TERR_COLOR: Record<TerrStatus, string> = { pulled: "#f59e0b", marketing: "#3b82f6", target: "#10b981", avoid: "#ef4444" };
const TERR_LABEL: Record<TerrStatus, string> = { pulled: "✅ Explored (pulled)", marketing: "📣 Marketing now", target: "🎯 Target / to pull", avoid: "⛔ Avoid / saturated" };

// Minimal CSV parser that respects quoted fields (handles commas/newlines inside quotes).
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

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

export default function HaloMarketMap({ markets, buyerPoints = [], geocodeRemaining = 0, canEdit = false, territories = [], terrStats = {}, scanPoints = [], leadPins = [], leadZipsRemaining = 0, buyerCoverage = [], pullStats = {}, campaignHealth = {}, closedDeals = [] }: { markets: MarketView[]; buyerPoints?: Pt[]; geocodeRemaining?: number; canEdit?: boolean; territories?: Territory[]; terrStats?: Record<string, { leads: number; deals: number }>; scanPoints?: ScanPt[]; leadPins?: LeadPin[]; leadZipsRemaining?: number; buyerCoverage?: BuyerCoverage[]; pullStats?: Record<string, { leads: number; offersMade: number; contractSent: number; closed: number; value: number }>; campaignHealth?: Record<string, { replied: number; interested: number; priced: number; notInterested: number; optedOut: number }>; closedDeals?: ClosedDeal[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const dataRef = useRef<unknown>(null);   // markets + buyers + saved territories
  const fogRef = useRef<unknown>(null);    // 🌫 fog-of-war overlay (under the data layer)
  const lotsRef = useRef<unknown>(null);   // 🏘 live parcel/lot layer (on-zoom, free GIS)
  const lotsLoaderRef = useRef<(() => void) | null>(null); // trigger a parcel refetch from outside the map effect
  const showLotsRef = useRef(false);       // latest show.lots for the map event handler closure
  const showFogRef = useRef(true);         // latest show.fog for the zoom handler closure
  const pullRef = useRef<unknown>(null);        // 📄 uploaded pulled-list pins layer
  const pullCanvasRef = useRef<unknown>(null);  // canvas renderer so thousands of pins stay smooth
  const pullFileRef = useRef<HTMLInputElement>(null);
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
  // 📌 Multi-market staging (Jon 2026-11-11): pick several areas one at a time (a pull often spans
  // several — e.g. Port St. Lucie + Fort Pierce), then mark them ALL explored in one click.
  const [picks, setPicks] = useState<{ label: string; lat: number; lon: number }[]>([]);
  // 🔎 Always-visible "search a market to ZOOM" (Jon 2026-11-11) — just flies the map, no marking.
  const [zoomQ, setZoomQ] = useState("");
  const [zoomSugs, setZoomSugs] = useState<{ label: string; sub?: string; lat: number; lon: number }[]>([]);
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sensible defaults so the map isn't overwhelming (Jon 2026-11-08): the key layers on, the two
  // busiest (cyan buyer dots + green buying-power polygons) off until toggled.
  // 🧹 Simplified (Jon 2026-11-11): fog of war removed (the uploaded pulled-list pins now show where
  // we've explored). Kept in state as off so no fog code path runs; it's gone from the UI.
  const [show, setShow] = useState({ markets: true, buyers: false, terr: true, opp: true, leads: true, power: false, fog: false, lots: false, pull: true });
  const [pullZoomR, setPullZoomR] = useState(3); // purple pulled-pin radius grows as you zoom in, so leads stay findable
  const [tools, setTools] = useState(false); // collapse the layer checkboxes + extra tools behind a menu
  const [lotsMsg, setLotsMsg] = useState(""); // feedback for the on-zoom lot layer so you know WHY lots do/don't show
  // 📄 Uploaded pulled-list batches (pins on the map, no CRM import) — Jon 2026-11-11.
  const [pullBatches, setPullBatches] = useState<{ id: string; name: string; at: string; by: string; count: number; zips: string[]; pts: [number, number][] }[]>([]);
  const [pullMsg, setPullMsg] = useState("");
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

  // Mark a list of named places (city/county/ZIP) explored in one call — shared by the staged-picks
  // flow and the paste-a-list bulk box. Each is geocoded + saved as a territory server-side.
  async function markPlaces(places: string[], status: TerrStatus): Promise<boolean> {
    if (!places.length) return false;
    setBulkBusy(true); setGeoMsg(`Marking ${places.length} area${places.length > 1 ? "s" : ""}… (~1s each, free)`);
    try {
      const r = await fetch("/api/markets/bulk-mark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ places, status }) });
      const j = await r.json();
      if (!r.ok) { setGeoMsg(j.error || "bulk-mark failed"); return false; }
      setGeoMsg(`✅ Marked ${j.marked}/${j.total}${j.failed?.length ? ` · couldn't find: ${j.failed.slice(0, 5).join(", ")}` : ""}`);
      router.refresh();
      return true;
    } catch { setGeoMsg("network error"); return false; } finally { setBulkBusy(false); }
  }

  async function bulkMark() {
    const places = bulkText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (await markPlaces(places, bulkStatus)) { setBulkText(""); setBulkOpen(false); }
  }

  // 📄 Upload a pulled lead CSV (with lat/lng) → plot the EXACT properties on the map + mark the ZIP
  // areas pulled. NO CRM import — this only shows where the pull landed + records coverage (Jon 2026-11-11).
  async function onPullFile(file: File) {
    setPullMsg("Reading file…");
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) { setPullMsg("Empty or unreadable CSV."); return; }
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const col = (...res: RegExp[]) => header.findIndex((h) => res.some((re) => re.test(h)));
      const latI = col(/^lat/, /latitude/), lngI = col(/^lon/, /^lng/, /longitude/), zipI = col(/zip/, /postal/);
      if (latI < 0 || lngI < 0) { setPullMsg("No latitude/longitude columns found in this CSV."); return; }
      const pts: [number, number][] = []; const zipSet = new Set<string>(); let count = 0;
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || r.length <= Math.max(latI, lngI)) continue;
        count++;
        const la = parseFloat(r[latI]), lo = parseFloat(r[lngI]);
        if (Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && (la !== 0 || lo !== 0)) pts.push([la, lo]);
        if (zipI >= 0) { const z = (r[zipI] || "").replace(/\D/g, "").slice(0, 5); if (z.length === 5) zipSet.add(z); }
      }
      if (!pts.length) { setPullMsg("No valid lat/long rows found in the file."); return; }
      const zips = [...zipSet];
      setPullMsg(`Plotting ${pts.length.toLocaleString()} properties…`);
      const res = await fetch("/api/markets/pull-list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name.replace(/\.csv$/i, "").slice(0, 60), count, zips, pts }) });
      const j = await res.json();
      if (!res.ok) { setPullMsg(j.error || "save failed"); return; }
      setPullBatches((b) => [j.batch, ...b]);
      setShow((s) => ({ ...s, pull: true }));
      // No more orange ZIP boxes — the pins ARE the coverage. The batch keeps the ZIPs for the
      // cooldown + Phase-2 conversion tracking (Jon 2026-11-11).
      setPullMsg(`✅ Plotted ${pts.length.toLocaleString()} properties${zips.length ? ` across ${zips.length} ZIP${zips.length > 1 ? "s" : ""}` : ""} · 90-day cooldown started`);
    } catch { setPullMsg("Couldn't read that file."); }
  }
  async function deletePullBatch(id: string) {
    await fetch(`/api/markets/pull-list?id=${id}`, { method: "DELETE" }).catch(() => {});
    setPullBatches((b) => b.filter((x) => x.id !== id));
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
  function onZoomChange(v: string) {
    setZoomQ(v);
    if (zoomTimer.current) clearTimeout(zoomTimer.current);
    if (v.trim().length < 3) { setZoomSugs([]); return; }
    zoomTimer.current = setTimeout(async () => {
      try { const r = await fetch(`/api/markets/geo-suggest?q=${encodeURIComponent(v.trim())}`); const j = await r.json(); setZoomSugs(Array.isArray(j.items) ? j.items : []); } catch { setZoomSugs([]); }
    }, 280);
  }
  function flyToSuggest(s: { label: string; lat: number; lon: number }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any;
    if (map && Number.isFinite(s.lat) && Number.isFinite(s.lon)) { try { map.flyTo([s.lat, s.lon], 11); } catch { /* ignore */ } }
    setZoomQ(s.label); setZoomSugs([]);
  }
  function pickSuggest(s: { label: string; lat: number; lon: number }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any;
    if (map && Number.isFinite(s.lat) && Number.isFinite(s.lon)) { try { map.flyTo([s.lat, s.lon], 10); } catch { /* ignore */ } }
    // Stage it (don't replace) so you can add several, then mark them all (Jon 2026-11-11).
    setPicks((p) => (p.some((x) => x.label === s.label) ? p : [...p, { label: s.label, lat: s.lat, lon: s.lon }]));
    setSearchQ(""); setSuggests([]);
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
        pullCanvasRef.current = L.canvas({ padding: 0.5 }); // 📄 canvas renderer keeps thousands of pins smooth
        pullRef.current = L.layerGroup().addTo(map);        // 📄 uploaded pulled-list pins

        // 🏘 On-zoom parcel layer — pulls vacant lots (and flags recent sales) from the free FDEP
        // cadastral for the current viewport, debounced, only when zoomed in + toggled on. Failures
        // (CORS/offline/too-many) degrade silently to an empty layer — never breaks the map.
        let lotsTimer: ReturnType<typeof setTimeout> | null = null;
        let lotsReqId = 0;
        const loadLots = async () => {
          const grp = lotsRef.current as any; if (!grp) return;
          if (!showLotsRef.current) { grp.clearLayers(); setLotsMsg(""); return; }
          if (map.getZoom() < LOTS_MIN_ZOOM) { grp.clearLayers(); setLotsMsg("🔍 Zoom in to street level (any Florida metro) to load parcel boxes"); return; }
          const b = map.getBounds();
          const envelope = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
          const url = `${FDEP_CADASTRAL}?where=${encodeURIComponent(LOTS_VACANT_WHERE)}&geometry=${encodeURIComponent(envelope)}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${encodeURIComponent("PARCEL_ID,DOR_UC,JV,LND_SQFOOT,SALE_PRC1,SALE_YR1,SALE_MO1,OWN_NAME,PHY_ADDR1,PHY_CITY,LND_VAL")}&returnGeometry=true&outSR=4326&resultRecordCount=2000&resultType=tile&f=geojson`;
          const myReq = ++lotsReqId;
          setLotsMsg("Loading lots…");
          try {
            const res = await fetch(url);
            const gj = await res.json();
            if (myReq !== lotsReqId) return; // a newer pan/zoom superseded this one
            grp.clearLayers();
            const feats = Array.isArray(gj?.features) ? gj.features : [];
            if (!feats.length) { setLotsMsg("No vacant lots in this view — pan to a residential/land area and they'll box up"); return; }
            setLotsMsg(`🏘 ${feats.length} lot boxes in view · 🔴 red = vacant · 🟡 yellow = sold ≤2 yrs · click a box for county record`);
            const thisYear = new Date().getFullYear();
            L.geoJSON(gj, {
              style: (feat: any) => {
                const p = feat.properties || {};
                const sold = (p.SALE_YR1 || 0) >= thisYear - 2 && (p.SALE_PRC1 || 0) > 1000;
                // Zillow-style, high-visibility lot boxes (Jon 2026-11-11): recently SOLD = yellow,
                // vacant/available = red, with a clear outline so you can actually see the parcels.
                const c = sold ? "#eab308" : "#ef4444";
                return { color: c, weight: 1.6, fillColor: c, fillOpacity: sold ? 0.45 : 0.3 };
              },
              onEachFeature: (feat: any, layer: any) => {
                const p = feat.properties || {};
                const ac = p.LND_SQFOOT ? (p.LND_SQFOOT / 43560).toFixed(2) : "—";
                const sale = p.SALE_YR1 && p.SALE_PRC1 > 1000 ? `🏷 Last sale ${p.SALE_MO1 || ""}/${p.SALE_YR1}: <b>$${Math.round(p.SALE_PRC1).toLocaleString()}</b>` : "🏷 No recent arm's-length sale";
                const uc = p.DOR_UC === "000" ? "Vacant residential" : p.DOR_UC === "010" ? "Vacant commercial" : p.DOR_UC === "040" ? "Vacant industrial" : /^0[5-6]\d$/.test(p.DOR_UC) ? "Agricultural" : `Use ${p.DOR_UC}`;
                const addr = p.PHY_ADDR1 ? `📍 ${String(p.PHY_ADDR1).trim()}${p.PHY_CITY ? ", " + String(p.PHY_CITY).trim() : ""}<br>` : "";
                const land = p.LND_VAL > 0 ? `<br>🌱 Land value: <b>$${Math.round(p.LND_VAL).toLocaleString()}</b>` : "";
                layer.bindPopup(`<div style="font:12px system-ui;min-width:180px"><b>${uc}</b><br>${addr}💰 Just value: <b>$${Math.round(p.JV || 0).toLocaleString()}</b>${land}<br>📐 ${ac} ac<br>${sale}<br>👤 ${p.OWN_NAME || "—"}<br><span style="color:#64748b">Parcel ${p.PARCEL_ID || ""}</span></div>`);
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

  // 📄 Load saved pulled-list batches once (manager-only endpoint; silently no-ops otherwise).
  useEffect(() => {
    fetch("/api/markets/pull-list").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.batches) setPullBatches(j.batches); }).catch(() => {});
  }, []);

  // 🔎 Pulled pins grow as you zoom in, so a lead never shrinks into an unfindable speck (Jon 2026-11-11).
  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any; if (!map) return;
    const upd = () => { const z = map.getZoom(); setPullZoomR(z >= 17 ? 10 : z >= 15 ? 7 : z >= 13 ? 5 : 3); };
    upd(); map.on("zoomend", upd);
    return () => { try { map.off("zoomend", upd); } catch { /* ok */ } };
  }, [ready]);

  // 📄 Draw the pulled-list pins (canvas-rendered so thousands stay smooth). Each pin is CLICKABLE:
  // clicking pulls that exact lot's county record for FREE (owner, assessed/just value, acreage, last
  // sale) from the statewide cadastral AND draws the lot line — so a pulled lead is rich, not a dot.
  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L; const grp = pullRef.current as any; if (!L || !grp) return;
    grp.clearLayers();
    if (!show.pull) return;
    const canvas = pullCanvasRef.current;
    const rad = pullZoomR;
    const enrichLot = async (lat: number, lng: number, marker: any) => {
      marker.bindPopup(`<div style="font:12px system-ui">📄 Pulled lead<br><span style="color:#64748b">Loading county record…</span></div>`).openPopup();
      try {
        const url = `${FDEP_CADASTRAL}?where=1%3D1&geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${encodeURIComponent("PARCEL_ID,DOR_UC,JV,LND_VAL,LND_SQFOOT,SALE_PRC1,SALE_YR1,SALE_MO1,OWN_NAME,PHY_ADDR1,PHY_CITY")}&returnGeometry=true&outSR=4326&f=geojson`;
        const gj = await (await fetch(url)).json();
        const f = Array.isArray(gj?.features) ? gj.features[0] : null;
        if (!f) { marker.setPopupContent(`<div style="font:12px system-ui">📄 Pulled lead<br><span style="color:#64748b">No county parcel right here — nudge the map and click again.</span></div>`); return; }
        try { L.geoJSON(f, { style: { color: "#c084fc", weight: 2.5, fillColor: "#a855f7", fillOpacity: 0.1 } }).addTo(grp); } catch { /* ok */ }
        marker.setPopupContent(lotRecordHtml(f.properties || {}));
        marker.openPopup();
      } catch { marker.setPopupContent(`<div style="font:12px system-ui">📄 Pulled lead<br><span style="color:#64748b">Couldn't reach county records — try again.</span></div>`); }
    };
    for (const b of pullBatches) for (const [lat, lng] of b.pts) {
      const mk = L.circleMarker([lat, lng], { renderer: canvas, radius: rad, stroke: rad >= 5, color: "#ffffff", weight: 1, fillColor: "#a855f7", fillOpacity: 0.8, interactive: true }).addTo(grp);
      mk.on("click", () => enrichLot(lat, lng, mk));
    }
  }, [ready, pullBatches, show.pull, pullZoomR]);

  // ── redraw data layers whenever the data changes (markets, buyers, territories) ──
  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L; const map = mapRef.current as any; const group = dataRef.current as any;
    if (!L || !map || !group) return;
    group.clearLayers();

    // 🟢 Area coverage — instead of a lone dot for a city, shade the WHOLE area in the market's color
    // with a soft radial falloff (stacked translucent rings = a gradient the map still shows through),
    // plus a small solid center dot so you still know the exact point (Jon 2026-11-11). Rings are
    // non-interactive so clicks fall through to the lead/lot pins underneath; the center dot carries
    // the popup/label. groundM = ground radius in metres (scales with zoom, unlike a pixel dot).
    const areaCover = (lat: number, lng: number, color: string, groundM: number, centerR: number) => {
      for (const [f, op] of [[1, 0.05], [0.64, 0.09], [0.34, 0.15]] as const) {
        L.circle([lat, lng], { radius: groundM * f, stroke: false, fillColor: color, fillOpacity: op, interactive: false }).addTo(group);
      }
      return L.circleMarker([lat, lng], { radius: centerR, color: "#ffffff", weight: 1.5, fillColor: color, fillOpacity: 0.95 }).addTo(group);
    };

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

    // 💪 Buying-power layer (base) — counties where vetted buyers want to buy, as TEAL boundaries
    // (teal, not green, so it never gets confused with the green Target-market dots — Jon 2026-11-11).
    if (show.power) for (const bc of buyerCoverage) {
      const op = Math.min(0.4, 0.12 + bc.buyers * 0.05);
      const poly = L.polygon(bc.ring, { color: "#0d9488", weight: 1.5, fillColor: "#14b8a6", fillOpacity: op }).addTo(group);
      poly.bindTooltip(`💪 ${bc.name.replace(/ County$/, "")} — ${bc.buyers} buyer${bc.buyers > 1 ? "s" : ""}`, { sticky: true });
      poly.bindPopup(`<div style="font:12px system-ui"><b>💪 ${bc.name}</b><br><b>${bc.buyers}</b> vetted buyer${bc.buyers > 1 ? "s" : ""} want this market${bc.newMarket ? " · 🆕 new" : ""}</div>`);
    }

    if (show.terr) for (const t of territories) {
      if (!t.points || t.points.length < 3) continue;
      if (t.status === "pulled") continue; // 🧹 no more orange "pulled" boxes — the uploaded pins show where we pulled now (Jon 2026-11-11)
      const poly = L.polygon(t.points, { color: TERR_COLOR[t.status], weight: 2, fillColor: TERR_COLOR[t.status], fillOpacity: 0.22 }).addTo(group);
      const st = terrStats[t.id];
      const tg = gradeMarket({ leads: st?.leads ?? 0, deals: st?.deals ?? 0, pulled: t.pulled });
      const statLine = st && (st.leads || st.deals) ? ` · 📥 ${st.leads} leads · 🏆 ${st.deals} deals` : "";
      poly.bindTooltip(`${TERR_LABEL[t.status]} — ${t.name} · ${tg.grade}${statLine}`, { sticky: true });
      poly.bindPopup(`<div style="font:12px system-ui"><b>${TERR_LABEL[t.status]}</b><br>${t.name}${t.at ? `<br>📅 Marked ${t.at.slice(0, 10)}${t.by ? ` by ${t.by.split(" ")[0]}` : ""}` : ""}${t.pulled ? `<br>🎯 <b>${t.pulled.toLocaleString()}</b> leads pulled` : ""}<br>🏅 <b style="color:${tg.color}">${tg.label}</b>${st ? `<br>📥 <b>${st.leads}</b> leads · 🏆 <b>${st.deals}</b> deals in our CRM here` : ""}</div>`);
    }
    if (show.buyers) for (const p of buyerPoints) L.circleMarker([p.lat, p.lng], { radius: 9, stroke: false, fillColor: "#22d3ee", fillOpacity: 0.22 }).addTo(group);

    // 📍 Lead pins — seller-lead DENSITY by ZIP (blue, sized by lead count). Closed deals are their own
    // authoritative ⭐ layer now (from the Deal board, exact address) — not inferred from ZIP here.
    if (show.leads) for (const lp of leadPins) {
      const g = gradeMarket({ leads: lp.leads, deals: lp.deals });
      const rad = 4 + Math.min(10, Math.log2(lp.leads + 1) * 2.2);
      L.circleMarker([lp.lat, lp.lng], { radius: rad, color: "#ffffff", weight: 1, fillColor: "#38bdf8", fillOpacity: 0.9 }).addTo(group)
        .bindPopup(`<div style="font:12px system-ui"><b>ZIP ${lp.zip}</b><br>📥 <b>${lp.leads}</b> seller lead${lp.leads > 1 ? "s" : ""}<br>🏅 <b style="color:${g.color}">${g.label}</b></div>`);
    }

    // ⭐ Closed deals — the authoritative closed-deals section (Deal board), pinned at the EXACT
    // property address as a gold star with a rich win popup (buyer, sale price, our fee) (Jon 2026-11-11).
    if (show.leads) for (const d of closedDeals) {
      const star = L.divIcon({ className: "fo-deal-star", html: `<div style="font-size:26px;line-height:1;filter:drop-shadow(0 0 4px rgba(0,0,0,.8))">⭐</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
      const price = d.soldPrice ? `<div>🤝 Sold${d.buyer ? ` to ${d.buyer}` : ""}: <b>$${Math.round(d.soldPrice).toLocaleString()}</b></div>` : d.buyer ? `<div>🤝 Buyer: ${d.buyer}</div>` : "";
      const fee = d.fee ? `<div>💰 Our fee: <b style="color:#16a34a">$${Math.round(d.fee).toLocaleString()}</b></div>` : "";
      L.marker([d.lat, d.lng], { icon: star, zIndexOffset: 1200 }).addTo(group)
        .bindPopup(`<div style="font:12px system-ui;min-width:180px"><div style="font-weight:800">⭐ CLOSED land deal</div><div style="color:#334155">📍 ${d.address}</div>${price}${fee}${d.dealType ? `<div>🏷 ${d.dealType}</div>` : ""}${d.soldDate ? `<div style="color:#64748b">Closed ${d.soldDate}</div>` : ""}</div>`);
    }

    // 🔎 Opportunity layer — Market Finder county scores (public data). Show target + watch only
    // to keep the map clean; color by tier, size by score. Diamond-ish via a square-ish marker.
    const OPP_COLOR = { target: "#10b981", watch: "#f59e0b", low: "#94a3b8" } as const;
    if (show.opp) for (const s of scanPoints) {
      if (s.tier === "low") continue;
      const rad = 5 + (s.score / 100) * 7;
      // Whole-area coverage (soft gradient) instead of a lone dot — ground radius grows with the score.
      const mk = areaCover(s.lat, s.lng, OPP_COLOR[s.tier], 7000 + (s.score / 100) * 7000, rad);
      const landLine = s.landShare != null ? `<div>🏕 Land ≥$100k: <b>${Math.round(s.landShare * 100)}%</b> of parcels</div>` : "";
      const t = s.trends;
      // 📈 Land & new-construction VELOCITY — the real "is this market moving?" read (Jon 2026-11-11).
      const trendBlock = t
        ? `<div style="margin:5px 0;padding:5px 7px;background:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0">` +
            `<div style="font-weight:700;color:#166534">🌱 LAND sold ($50k+) <span style="color:#64748b;font-weight:600">(30/90/180d)</span></div>` +
            `<div style="font-size:14px;font-weight:800;color:#15803d">${t.landSold.d30} · ${t.landSold.d90} · ${t.landSold.d180}</div>` +
            `<div style="font-weight:700;color:#166534;margin-top:3px">🏗 New construction sold <span style="color:#64748b;font-weight:600">(30/90/180d)</span></div>` +
            `<div style="font-size:14px;font-weight:800;color:#15803d">${t.newConSold.d30} · ${t.newConSold.d90} · ${t.newConSold.d180}</div>` +
            `<div style="margin-top:3px;color:#334155">⏳ Pending now: <b>${t.landPending}</b> land · <b>${t.newConPending}</b> new-con</div>` +
            (t.yoyLandPct != null ? `<div style="color:${t.yoyLandPct >= 0 ? "#15803d" : "#b91c1c"};font-weight:700">📊 Land sales ${t.yoyLandPct >= 0 ? "+" : ""}${t.yoyLandPct}% YoY ${t.yoyLandPct >= 0 ? "(growing 🔥)" : "(cooling)"}</div>` : "") +
          `</div>`
        : `<div style="color:#94a3b8;font-size:11px;margin:3px 0">📈 Land-sales velocity loading — run a market refresh to fill it in.</div>`;
      const homeYoy = s.yoy != null ? ` · ${s.yoy >= 0 ? "+" : ""}${s.yoy}% YoY` : "";
      mk.bindPopup(
        `<div style="font:12px system-ui;min-width:210px"><div style="font-weight:800;font-size:13px">${s.name} <span style="color:#64748b;font-weight:600">${s.state}</span></div>` +
        `<div style="margin:3px 0"><b style="font-size:15px">${s.score}</b> opportunity · ${s.tier === "target" ? "🟢 Target — pull here next" : "🟠 Watch — monitor for now"}${s.testMarket ? ` · <span style="background:#fae8ff;color:#a21caf;border-radius:4px;padding:1px 4px;font-weight:700">🧪 test market</span>` : ""}</div>` +
        (s.buyers != null ? `<div style="font-weight:700;color:${s.buyers > 0 ? "#0d9488" : "#94a3b8"}">💰 ${s.buyers > 0 ? `${s.buyers} vetted buyer${s.buyers === 1 ? "" : "s"} waiting here` : "No vetted buyers here yet"}</div>` : "") +
        (s.ring ? `<div style="font-weight:700;color:#a21caf">🍩 Conversion ring: <b>${s.ring}</b>/100 — cheap land converting to housing${s.residual ? ` · 🏗 builder budget ~$${Math.round(s.residual / 1000)}k/lot` : ""}</div>` : "") +
        trendBlock + landLine +
        `<div>⏱ ${s.dtp != null ? "~" + Math.round(s.dtp) + " days to pending (homes)" : "—"}</div>` +
        `<div style="color:#94a3b8;font-size:11px;margin-top:3px">🏠 Area home price ${s.price != null ? "$" + Math.round(s.price).toLocaleString() : "—"}${homeYoy} — wealth signal, not land</div></div>`);
      mk.bindTooltip(`${s.name} · ${s.score}`, { direction: "top", className: "fo-map-label", offset: [0, -rad] });
    }

    const placed = show.markets ? markets.filter((v) => COORDS[v.m.name]) : [];
    const maxDeals = Math.max(1, ...placed.map((v) => v.deals));
    for (const v of placed) {
      const [lat, lng] = COORDS[v.m.name];
      const charted = v.buyerCount > 0;
      if (charted) L.circleMarker([lat, lng], { radius: 20 + Math.min(10, v.buyerCount * 2), stroke: false, fillColor: "#22d3ee", fillOpacity: 0.12 }).addTo(group);
      const r = 6 + (v.deals / maxDeals) * 7;
      const cov = v.coverage.status === "never" ? "Never pulled" : v.coverage.status === "clear" ? `Clear to pull · last ${v.coverage.lastPull}` : `Cooldown ${v.coverage.cooldownLeft}d`;
      // Whole-area coverage (soft gradient) instead of a lone dot — bigger area where we've closed more.
      const marker = areaCover(lat, lng, COV_COLOR[v.coverage.status] ?? "#64748b", 6000 + (v.deals / maxDeals) * 7000, r);
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
  }, [ready, markets, buyerPoints, territories, show, scanPoints, leadPins, buyerCoverage, closedDeals]);

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
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#10b981" }} /> 🟢 Target — pull next</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#f59e0b" }} /> 🟠 Watch — monitor</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#38bdf8" }} /> Seller lead</span>
        <span className="flex items-center gap-1.5"><span className="text-[13px] leading-none">⭐</span> Closed deal</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm ring-1 ring-red-400" style={{ background: "#ef4444", opacity: 0.6 }} /> 🏘 Vacant lot</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm ring-1 ring-yellow-400" style={{ background: "#eab308", opacity: 0.7 }} /> Recently sold lot</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#a855f7" }} /> 📄 Pulled-list property</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: "#14b8a6", opacity: 0.5 }} /> 💪 Buyer coverage</span>
        <span className="text-slate-500">· bigger = more</span>
        <button onClick={enterFs} className="ml-auto rounded-full bg-slate-700/70 px-2.5 py-1 font-bold text-slate-100 ring-1 ring-slate-600 hover:bg-slate-600">⛶ Full screen</button>
        <span className="rounded-full bg-cyan-500/20 px-2.5 py-1 font-bold text-cyan-300 ring-1 ring-cyan-500/30">{charted}/{markets.length} w/ buyers</span>
      </div>
      <div className="mb-1 flex flex-wrap items-center gap-2 px-1 text-[11px]">
        <div className="relative">
          <input value={zoomQ} onChange={(e) => onZoomChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && zoomSugs[0]) flyToSuggest(zoomSugs[0]); }} placeholder="🔎 Search a market to zoom…" className="w-56 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-white placeholder:text-slate-500" />
          {zoomSugs.length > 0 && (
            <div className="absolute left-0 top-full z-[600] mt-1 w-72 overflow-hidden rounded-lg border border-slate-600 bg-slate-900 shadow-xl">
              {zoomSugs.map((s, i) => (
                <button key={i} type="button" onClick={() => flyToSuggest(s)} className="block w-full px-3 py-1.5 text-left text-[12px] text-white hover:bg-slate-700"><span className="font-semibold">{s.label}</span>{s.sub && <span className="ml-1 text-slate-400">· {s.sub}</span>}</button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => setTools((t) => !t)} className="rounded-lg bg-slate-800 px-2.5 py-1 font-bold text-slate-200 ring-1 ring-slate-700 hover:bg-slate-700">⚙ Layers &amp; tools {tools ? "▴" : "▾"}</button>
        {canEdit && (
          <>
            <input ref={pullFileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPullFile(f); e.target.value = ""; }} />
            <button onClick={() => pullFileRef.current?.click()} title="Upload a pulled lead CSV (lat/lng) → plots the exact properties + marks those ZIP areas pulled. No CRM import. This is how we mark where we've pulled now." className="rounded-lg bg-purple-600 px-3 py-1 font-bold text-white hover:bg-purple-700">📄 Upload pull list (CSV)</button>
          </>
        )}
        {pullMsg && <span className="font-semibold text-purple-300">{pullMsg}</span>}
        {geoMsg && <span className="text-slate-400">{geoMsg}</span>}
        {tools && (["pull", "leads", "markets", "lots", "terr", "opp", "buyers", "power"] as const).map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-1 text-slate-300"><input type="checkbox" checked={show[k]} onChange={(e) => setShow((s) => ({ ...s, [k]: e.target.checked }))} /> {k === "lots" ? "🏘 Lots (zoom in)" : k === "opp" ? "🔎 Opportunity" : k === "markets" ? "🎯 Markets" : k === "buyers" ? "🟢 Buyers" : k === "power" ? "💪 Buying power" : k === "leads" ? "📍 Leads" : k === "terr" ? "🖍 My areas" : "📄 Pulled list"}</label>
        ))}
        {tools && canEdit && <button onClick={runGeocode} disabled={geoBusy} className="rounded-lg bg-cyan-600 px-2.5 py-1 font-bold text-white hover:bg-cyan-700 disabled:opacity-50">{geoBusy ? "Mapping…" : geocodeRemaining > 0 ? `🔄 Map buyer areas (${geocodeRemaining} left)` : "🔄 Re-map buyers"}</button>}
        {tools && canEdit && leadZipsRemaining > 0 && <button onClick={runGeocodeLeads} disabled={geoBusy} className="rounded-lg bg-sky-600 px-2.5 py-1 font-bold text-white hover:bg-sky-700 disabled:opacity-50">{geoBusy ? "Mapping…" : `📍 Map lead locations (${leadZipsRemaining} left)`}</button>}
        {tools && show.lots && lotsMsg && <span className="font-semibold text-sky-300">{lotsMsg}</span>}
      </div>
      {canEdit && tools && (
        <div className="mb-1 flex flex-wrap items-center gap-2 px-1 text-[11px]">
          <span className="font-bold text-slate-400">🔎 Mark by hand (optional — uploading a pull list is the main way now):</span>
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
          <button onClick={searchArea} disabled={searchBusy} className="rounded-lg bg-cyan-600 px-2.5 py-1 font-bold text-white hover:bg-cyan-700 disabled:opacity-50">{searchBusy ? "Searching…" : "🔎 Find & name one"}</button>
          <button onClick={() => setBulkOpen((b) => !b)} className="rounded-lg bg-slate-200 px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-300">📋 Bulk-mark ZIPs</button>
          <span className="text-slate-400">Pick several from the dropdown to stage them, then mark all · or draw ▱/⬠.</span>
        </div>
      )}
      {canEdit && tools && picks.length > 0 && (
        <div className="mb-1 flex flex-wrap items-center gap-1.5 px-1 text-[11px]">
          <span className="font-bold text-slate-400">📌 Staged ({picks.length}):</span>
          {picks.map((p) => (
            <span key={p.label} className="inline-flex items-center gap-1 rounded-full bg-cyan-900/50 px-2 py-0.5 font-semibold text-cyan-200 ring-1 ring-cyan-700/60">
              {p.label}
              <button onClick={() => setPicks((xs) => xs.filter((x) => x.label !== p.label))} className="text-cyan-300/70 hover:text-white">×</button>
            </span>
          ))}
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as TerrStatus)} className="rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 font-semibold text-white">
            <option value="pulled">📥 Pulled</option>
            <option value="marketing">📣 Marketing</option>
            <option value="target">🎯 Target</option>
            <option value="avoid">⛔ Avoid</option>
          </select>
          <button onClick={() => markPlaces(picks.map((p) => p.label), bulkStatus).then((ok) => { if (ok) setPicks([]); })} disabled={bulkBusy} className="rounded-lg bg-emerald-600 px-2.5 py-0.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{bulkBusy ? "Marking…" : `📌 Mark ${picks.length} explored`}</button>
          <button onClick={() => setPicks([])} className="text-slate-400 hover:text-slate-200">clear</button>
        </div>
      )}
      {canEdit && tools && bulkOpen && (
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
      {pullBatches.length > 0 && (() => {
        const conv = (id: string) => pullStats[id] || { leads: 0, offersMade: 0, contractSent: 0, closed: 0, value: 0 };
        const agg = pullBatches.reduce((a, b) => { const c = conv(b.id); a.pulled += b.count; a.leads += c.leads; a.offers += c.offersMade; a.contract += c.contractSent; a.closed += c.closed; a.value += c.value; return a; }, { pulled: 0, leads: 0, offers: 0, contract: 0, closed: 0, value: 0 });
        const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(n / d < 0.1 ? 2 : 1)}%` : "—");
        return (
        <div className="mt-2 px-1">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-400">📄 Uploaded pull lists ({pullBatches.length}) — purple pins show exactly where each pull landed (not in the CRM)
            <button onClick={() => zoomToTerritory(pullBatches.flatMap((b) => b.pts))} className="rounded bg-purple-500/20 px-1.5 py-0.5 text-purple-300 ring-1 ring-purple-500/40 hover:bg-purple-500/30">zoom to all</button>
          </div>
          {/* 📈 Conversion so far — leads traced back to each pull by ZIP + pull date. */}
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-slate-800/60 px-2.5 py-1.5 text-[11px] ring-1 ring-slate-700">
            <span className="font-bold text-slate-200">📈 Pull → close conversion:</span>
            <span className="text-slate-300">📤 <b>{agg.pulled.toLocaleString()}</b> pulled</span><span className="text-slate-600">→</span>
            <span className="text-sky-300">📥 <b>{agg.leads.toLocaleString()}</b> CRM leads <span className="text-slate-500">({pct(agg.leads, agg.pulled)})</span></span><span className="text-slate-600">→</span>
            <span className="text-teal-300" title="Leads we made an offer to — how the market is RESPONDING to our outreach">💵 <b>{agg.offers.toLocaleString()}</b> offers <span className="text-slate-500">({pct(agg.offers, agg.leads)} of leads)</span></span><span className="text-slate-600">→</span>
            <span className="text-emerald-300">📝 <b>{agg.contract.toLocaleString()}</b> contracts</span><span className="text-slate-600">→</span>
            <span className="text-amber-300">⭐ <b>{agg.closed.toLocaleString()}</b> closed{agg.value > 0 ? ` · $${Math.round(agg.value).toLocaleString()}` : ""}</span>
            <span className="ml-auto text-slate-500">traced by ZIP + “came in after the pull date”</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {pullBatches.map((b) => {
              const end = new Date(`${b.at}T00:00:00`); end.setDate(end.getDate() + 90);
              const left = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));
              const c = conv(b.id);
              return (
                <div key={b.id} className="rounded-lg bg-purple-900/40 px-2.5 py-1.5 text-[11px] ring-1 ring-purple-700/50">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-purple-200">
                    <button onClick={() => zoomToTerritory(b.pts)} title={`Zoom to this pull · ${b.count.toLocaleString()} properties${b.count > b.pts.length ? ` (showing ${b.pts.length.toLocaleString()} sampled pins)` : ""}`} className="hover:underline">📄 {b.name} · {b.count.toLocaleString()}{b.zips.length ? ` · ${b.zips.length} ZIP${b.zips.length > 1 ? "s" : ""}` : ""} · {b.at}</button>
                    <span className={left > 0 ? "text-amber-300" : "text-emerald-300"} title={left > 0 ? `Don't re-pull this area until ${end.toISOString().slice(0, 10)} (90-day cooldown)` : "Cooldown passed — OK to re-pull"}>{left > 0 ? `⏳ ${left}d` : "✓ clear"}</span>
                    {canEdit && <button onClick={() => deletePullBatch(b.id)} title="Remove this pull list" className="ml-auto text-purple-300/70 hover:text-white">× remove</button>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px]">
                    {c.leads > 0 ? (<>
                      <span className="text-sky-300">📥 <b>{c.leads}</b> lead{c.leads > 1 ? "s" : ""} <span className="text-slate-500">({pct(c.leads, b.count)})</span></span><span className="text-slate-600">→</span>
                      <span className="text-teal-300" title="Offers made — market response to our SMS">💵 <b>{c.offersMade}</b> offer{c.offersMade === 1 ? "" : "s"}</span><span className="text-slate-600">→</span>
                      <span className="text-emerald-300">📝 <b>{c.contractSent}</b> contract{c.contractSent === 1 ? "" : "s"}</span><span className="text-slate-600">→</span>
                      <span className="text-amber-300">⭐ <b>{c.closed}</b> closed{c.value > 0 ? ` · $${Math.round(c.value).toLocaleString()}` : ""}</span>
                    </>) : (<span className="text-slate-500">No CRM leads traced to this pull yet — they’ll appear here as sellers from these ZIPs come in.</span>)}
                  </div>
                  {/* 📊 Campaign Health — EVERY Direct REI text response for this campaign (not just imports). */}
                  {(() => { const h = campaignHealth[b.id]; if (!h || h.replied === 0) return null; return (
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded bg-slate-800/60 px-1.5 py-1 text-[10.5px] ring-1 ring-slate-700">
                      <span className="font-bold text-slate-300" title="Direct REI campaign responses">📊 Campaign:</span>
                      <span className="text-sky-300">💬 <b>{h.replied}</b> replied <span className="text-slate-500">({pct(h.replied, b.count)})</span></span><span className="text-slate-600">·</span>
                      <span className="text-emerald-300">👍 <b>{h.interested}</b> interested</span><span className="text-slate-600">·</span>
                      <span className="text-teal-300">💵 <b>{h.priced}</b> priced</span><span className="text-slate-600">·</span>
                      <span className="text-slate-400">🚫 <b>{h.notInterested + h.optedOut}</b> no/opt-out</span>
                    </div>
                  ); })()}
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}
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
