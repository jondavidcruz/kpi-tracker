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

type Pt = { lat: number; lng: number };

const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js";
const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css";
const DRAW_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js";
const DRAW_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css";
// Satellite basemap — FREE, NO API KEY (Carto now needs one). ESRI World Imagery = Halo look.
const SAT_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TILE_ATTR = "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

const COORDS: Record<string, [number, number]> = {
  "Miami / Coral Gables": [25.72, -80.26], "Palm Beach / West Palm Beach": [26.71, -80.06],
  "Boca Raton / Fort Lauderdale": [26.3, -80.12], "Naples / Port Royal": [26.14, -81.79],
  "Orlando / Windermere / Winter Park": [28.5, -81.5], "Tampa Bay": [27.95, -82.46],
  "Sarasota / Lakewood Ranch": [27.36, -82.53], "Jacksonville / Ponte Vedra": [30.24, -81.45],
  "Jupiter Island / Vero Beach": [27.5, -80.33], "30A / Alys Beach (NW Florida)": [30.3, -86.0],
};
const COV_COLOR: Record<string, string> = { never: "#64748b", clear: "#10b981", cooldown: "#f59e0b" };
const TERR_COLOR: Record<TerrStatus, string> = { pulled: "#f59e0b", marketing: "#3b82f6", target: "#10b981", avoid: "#ef4444" };
const TERR_LABEL: Record<TerrStatus, string> = { pulled: "📥 Pulled leads", marketing: "📣 Marketing now", target: "🎯 Target / to pull", avoid: "⛔ Avoid / saturated" };

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

export default function HaloMarketMap({ markets, buyerPoints = [], geocodeRemaining = 0, canEdit = false, territories = [], terrStats = {} }: { markets: MarketView[]; buyerPoints?: Pt[]; geocodeRemaining?: number; canEdit?: boolean; territories?: Territory[]; terrStats?: Record<string, { leads: number; deals: number }> }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const dataRef = useRef<unknown>(null);   // markets + buyers + saved territories
  const drawnRef = useRef<unknown>(null);  // the in-progress drawn shape
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");
  // a just-drawn shape awaiting a name + status
  const [pending, setPending] = useState<[number, number][] | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<TerrStatus>("marketing");
  const [saving, setSaving] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [big, setBig] = useState(false);
  const [show, setShow] = useState({ markets: true, buyers: true, terr: true });

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
      setPending(ring); setName(j.name || q); setStatus("marketing"); setSearchQ("");
    } catch { setGeoMsg("network error"); } finally { setSearchBusy(false); }
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
    fd.set("name", name || "Untitled area"); fd.set("status", status); fd.set("points", JSON.stringify(pending));
    const res = await saveTerritoryAction(fd).catch(() => ({ ok: false }));
    setSaving(false);
    if (res.ok) { clearDrawn(); router.refresh(); } else setGeoMsg("⚠️ couldn't save the area");
  }
  function clearDrawn() {
    setPending(null); setName("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dg = drawnRef.current as any; if (dg?.clearLayers) dg.clearLayers();
  }
  async function removeTerritory(id: string) {
    const fd = new FormData(); fd.set("id", id);
    await deleteTerritoryAction(fd).catch(() => {});
    router.refresh();
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
        const map = L.map(ref.current, { center: [28.2, -82.2], zoom: 6, scrollWheelZoom: false });
        mapRef.current = map;
        L.tileLayer(SAT_TILES, { attribution: TILE_ATTR, maxZoom: 18 }).addTo(map);
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

  // ── redraw data layers whenever the data changes (markets, buyers, territories) ──
  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L; const map = mapRef.current as any; const group = dataRef.current as any;
    if (!L || !map || !group) return;
    group.clearLayers();

    if (show.terr) for (const t of territories) {
      if (!t.points || t.points.length < 3) continue;
      const poly = L.polygon(t.points, { color: TERR_COLOR[t.status], weight: 2, fillColor: TERR_COLOR[t.status], fillOpacity: 0.22 }).addTo(group);
      const st = terrStats[t.id];
      const statLine = st && (st.leads || st.deals) ? ` · 📥 ${st.leads} leads · 🏆 ${st.deals} deals` : "";
      poly.bindTooltip(`${TERR_LABEL[t.status]} — ${t.name}${statLine}`, { sticky: true });
      poly.bindPopup(`<div style="font:12px system-ui"><b>${TERR_LABEL[t.status]}</b><br>${t.name}${st ? `<br>📥 <b>${st.leads}</b> leads · 🏆 <b>${st.deals}</b> deals in our CRM here` : ""}</div>`);
    }
    if (show.buyers) for (const p of buyerPoints) L.circleMarker([p.lat, p.lng], { radius: 9, stroke: false, fillColor: "#22d3ee", fillOpacity: 0.22 }).addTo(group);

    const placed = show.markets ? markets.filter((v) => COORDS[v.m.name]) : [];
    const maxDeals = Math.max(1, ...placed.map((v) => v.deals));
    for (const v of placed) {
      const [lat, lng] = COORDS[v.m.name];
      const charted = v.buyerCount > 0;
      if (charted) L.circleMarker([lat, lng], { radius: 20 + Math.min(10, v.buyerCount * 2), stroke: false, fillColor: "#22d3ee", fillOpacity: 0.12 }).addTo(group);
      const r = 7 + (v.deals / maxDeals) * 13;
      const cov = v.coverage.status === "never" ? "Never pulled" : v.coverage.status === "clear" ? `Clear to pull · last ${v.coverage.lastPull}` : `Cooldown ${v.coverage.cooldownLeft}d`;
      const marker = L.circleMarker([lat, lng], { radius: r, color: "#ffffff", weight: 1.5, fillColor: COV_COLOR[v.coverage.status] ?? "#64748b", fillOpacity: charted ? 0.9 : 0.4 }).addTo(group);
      marker.bindPopup(
        `<div style="font:12px system-ui;min-width:170px"><div style="font-weight:800;font-size:13px">${v.m.name}${v.m.waterfront ? " 🌊" : ""}</div>` +
        `<div style="color:#475569">${v.m.region} · W${v.m.wealth}/B${v.m.business}</div>` +
        `<div style="margin-top:4px">${charted ? `🟢 <b>${v.buyerCount} buyer${v.buyerCount > 1 ? "s" : ""}</b> can move deals here` : "⚪ <b>Uncharted</b> — no buyers yet"}</div>` +
        `<div>📍 ${cov}</div><div>🏷 ${v.deals} deals · ${v.leads} leads · 30/60/180: ${v.momentum.d30}/${v.momentum.d60}/${v.momentum.d180}</div></div>`);
      marker.bindTooltip(v.m.name.split(" / ")[0], { permanent: true, direction: "top", className: "fo-map-label", offset: [0, -r] });
    }
    try { map.fitBounds(group.getBounds().pad(0.15)); } catch { /* no markers */ }
  }, [ready, markets, buyerPoints, territories, show]);

  // Resize the map when the expand toggle changes.
  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any;
    const t = setTimeout(() => { try { map?.invalidateSize?.(); } catch { /* */ } }, 220);
    return () => clearTimeout(t);
  }, [big, ready]);

  const charted = markets.filter((v) => v.buyerCount > 0).length;
  return (
    <div className="rounded-2xl bg-slate-900 p-2 shadow-sm ring-1 ring-slate-800">
      <style>{`.fo-map-label{background:transparent;border:none;box-shadow:none;color:#f1f5f9;font:700 10px system-ui;text-shadow:0 1px 3px #000}.leaflet-popup-content{margin:10px 12px}`}</style>
      <div className="mb-2 flex flex-wrap items-center gap-3 px-1 text-[11px] font-semibold text-slate-300">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-400/40 ring-2 ring-cyan-400/40" /> Charted</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-500" /> Uncharted</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-blue-500/40 ring-1 ring-blue-400" /> drawn territories</span>
        <span className="ml-auto rounded-full bg-cyan-500/20 px-2.5 py-1 font-bold text-cyan-300 ring-1 ring-cyan-500/30">{charted}/{markets.length} charted</span>
      </div>
      <div className="mb-1 flex flex-wrap items-center gap-2 px-1 text-[11px]">
        <span className="font-bold text-slate-400">Layers:</span>
        {(["markets", "buyers", "terr"] as const).map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-1 text-slate-300"><input type="checkbox" checked={show[k]} onChange={(e) => setShow((s) => ({ ...s, [k]: e.target.checked }))} /> {k === "markets" ? "🎯 Markets" : k === "buyers" ? "🟢 Buyers" : "🖍 My areas"}</label>
        ))}
        <button onClick={() => setBig((b) => !b)} className="rounded-lg bg-slate-700 px-2.5 py-1 font-bold text-white hover:bg-slate-600">{big ? "⤡ Shrink" : "⛶ Expand"}</button>
        {canEdit && <button onClick={runGeocode} disabled={geoBusy} className="rounded-lg bg-cyan-600 px-2.5 py-1 font-bold text-white hover:bg-cyan-700 disabled:opacity-50">{geoBusy ? "Mapping…" : geocodeRemaining > 0 ? `🔄 Map buyer areas (${geocodeRemaining} left)` : "🔄 Re-map buyers"}</button>}
        {geoMsg && <span className="text-slate-400">{geoMsg}</span>}
      </div>
      {canEdit && (
        <div className="mb-1 flex flex-wrap items-center gap-2 px-1 text-[11px]">
          <span className="font-bold text-slate-400">🔎 Mark an area:</span>
          <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") searchArea(); }} placeholder="County or ZIP — e.g. Lee County, FL  or  33914" className="w-72 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-white" />
          <button onClick={searchArea} disabled={searchBusy} className="rounded-lg bg-cyan-600 px-2.5 py-1 font-bold text-white hover:bg-cyan-700 disabled:opacity-50">{searchBusy ? "Searching…" : "🔎 Find & mark"}</button>
          <span className="text-slate-400">drops the boundary ready to name — no drawing needed. Or draw with the ▱/⬠ tools (top-right).</span>
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
          <button onClick={saveDrawn} disabled={saving} className="rounded-lg bg-emerald-600 px-3 py-1 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? "Saving…" : "Save area"}</button>
          <button onClick={clearDrawn} className="rounded-lg bg-slate-600 px-3 py-1 font-bold text-white hover:bg-slate-500">Cancel</button>
        </div>
      )}
      <div ref={ref} className={`w-full overflow-hidden rounded-xl transition-all ${big ? "h-[82vh]" : "h-[560px]"}`} style={{ background: "#0b1220" }} />
      {territories.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 px-1">
          {territories.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: `${TERR_COLOR[t.status]}cc` }}>
              {TERR_LABEL[t.status].split(" ")[0]} {t.name}
              {terrStats[t.id] && (terrStats[t.id].leads > 0 || terrStats[t.id].deals > 0) && <span className="rounded bg-black/25 px-1 text-[10px]">📥{terrStats[t.id].leads} 🏆{terrStats[t.id].deals}</span>}
              {canEdit && <button onClick={() => removeTerritory(t.id)} title="Delete" className="ml-0.5 text-white/80 hover:text-white">×</button>}
            </span>
          ))}
        </div>
      )}
      <p className="mt-1 px-1 text-[10px] text-slate-500">Click a market for details. Glowing = buyers there. Draw areas to paint where you&apos;re marketing / have pulled vs open territory.</p>
    </div>
  );
}
