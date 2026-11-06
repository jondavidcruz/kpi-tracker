"use client";
// 🎮 Halo-style territory map (Jon 2026-11-05) — a real interactive Leaflet map with a
// fog-of-war feel: markets where vetted buyers can take a deal are "charted" and glow;
// markets with no buyer coverage are "uncharted" and dim. FREE + light on our infra —
// Leaflet loads from a CDN (not bundled into Vercel), dark tiles come from Carto's CDN
// (not our Supabase/Vercel), and all markers come from data the page already loaded.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MarketView } from "@/components/MarketsBoard";

type Pt = { lat: number; lng: number };

const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js";
const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css";
// Dark "fog-of-war" basemap (free, attribution required). {r} = retina.
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const COORDS: Record<string, [number, number]> = {
  "Miami / Coral Gables": [25.72, -80.26], "Palm Beach / West Palm Beach": [26.71, -80.06],
  "Boca Raton / Fort Lauderdale": [26.3, -80.12], "Naples / Port Royal": [26.14, -81.79],
  "Orlando / Windermere / Winter Park": [28.5, -81.5], "Tampa Bay": [27.95, -82.46],
  "Sarasota / Lakewood Ranch": [27.36, -82.53], "Jacksonville / Ponte Vedra": [30.24, -81.45],
  "Jupiter Island / Vero Beach": [27.5, -80.33], "30A / Alys Beach (NW Florida)": [30.3, -86.0],
};
const COV_COLOR: Record<string, string> = { never: "#64748b", clear: "#10b981", cooldown: "#f59e0b" };

function loadLeaflet(): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { L?: unknown };
    if (w.L) return resolve();
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    if (existing) { existing.addEventListener("load", () => resolve()); existing.addEventListener("error", reject); return; }
    const s = document.createElement("script");
    s.src = LEAFLET_JS;
    s.addEventListener("load", () => resolve()); s.addEventListener("error", reject);
    document.head.appendChild(s);
  });
}

export default function HaloMarketMap({ markets, buyerPoints = [], geocodeRemaining = 0, canEdit = false }: { markets: MarketView[]; buyerPoints?: Pt[]; geocodeRemaining?: number; canEdit?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const router = useRouter();
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");

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

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let L: any;
    loadLeaflet().then(() => {
      if (cancelled || !ref.current) return;
      L = (window as unknown as { L: any }).L; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (mapRef.current) return;
      const map = L.map(ref.current, { center: [28.2, -82.2], zoom: 6, scrollWheelZoom: false, attributionControl: true });
      mapRef.current = map;
      L.tileLayer(DARK_TILES, { attribution: TILE_ATTR, subdomains: "abcd", maxZoom: 18 }).addTo(map);

      const placed = markets.filter((v) => COORDS[v.m.name]);
      const maxDeals = Math.max(1, ...placed.map((v) => v.deals));
      const group = L.featureGroup().addTo(map);

      for (const v of placed) {
        const [lat, lng] = COORDS[v.m.name];
        const charted = v.buyerCount > 0;
        const color = COV_COLOR[v.coverage.status] ?? "#64748b";
        // Charted markets glow (a soft halo); uncharted stay dim.
        if (charted) {
          L.circleMarker([lat, lng], { radius: 20 + (v.buyerCount > 5 ? 10 : v.buyerCount * 2), stroke: false, fillColor: "#22d3ee", fillOpacity: 0.12 }).addTo(group);
        }
        const r = 7 + (v.deals / maxDeals) * 13;
        const marker = L.circleMarker([lat, lng], {
          radius: r, color: "#ffffff", weight: 1.5, fillColor: color,
          fillOpacity: charted ? 0.9 : 0.35,
        }).addTo(group);
        const cov = v.coverage.status === "never" ? "Never pulled" : v.coverage.status === "clear" ? `Clear to pull · last ${v.coverage.lastPull}` : `Cooldown ${v.coverage.cooldownLeft}d`;
        marker.bindPopup(
          `<div style="font:12px system-ui;min-width:170px">
             <div style="font-weight:800;font-size:13px">${v.m.name}${v.m.waterfront ? " 🌊" : ""}</div>
             <div style="color:#475569">${v.m.region} · W${v.m.wealth}/B${v.m.business}</div>
             <div style="margin-top:4px">${charted ? `🟢 <b>${v.buyerCount} buyer${v.buyerCount > 1 ? "s" : ""}</b> can move deals here` : "⚪ <b>Uncharted</b> — no buyers yet"}</div>
             <div>📍 ${cov}</div>
             <div>🏷 ${v.deals} deals · ${v.leads} leads · 30/60/180: ${v.momentum.d30}/${v.momentum.d60}/${v.momentum.d180}${v.momentum.trend === "up" ? " 📈" : v.momentum.trend === "down" ? " 📉" : ""}</div>
           </div>`,
        );
        marker.bindTooltip(v.m.name.split(" / ")[0], { permanent: true, direction: "top", className: "fo-map-label", offset: [0, -r] });
      }
      // 🟢 Buyer buy-box coverage cloud — each geocoded buy-box area is a soft cyan circle;
      // together they show the "charted" reach where we have buyers to move deals.
      for (const p of buyerPoints) {
        L.circleMarker([p.lat, p.lng], { radius: 9, stroke: false, fillColor: "#22d3ee", fillOpacity: 0.22 }).addTo(group);
      }

      try { map.fitBounds(group.getBounds().pad(0.15)); } catch { /* single/no markers */ }
    }).catch(() => { /* CDN blocked — the card view still works */ });

    return () => { cancelled = true; const m = mapRef.current as { remove?: () => void } | null; if (m?.remove) { m.remove(); mapRef.current = null; } };
  }, [markets, buyerPoints]);

  const charted = markets.filter((v) => v.buyerCount > 0).length;
  return (
    <div className="rounded-2xl bg-slate-900 p-2 shadow-sm ring-1 ring-slate-800">
      <style>{`.fo-map-label{background:transparent;border:none;box-shadow:none;color:#e2e8f0;font:700 10px system-ui;text-shadow:0 1px 3px #000}.leaflet-popup-content{margin:10px 12px}`}</style>
      <div className="mb-2 flex flex-wrap items-center gap-3 px-1 text-[11px] font-semibold text-slate-300">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-400/40 ring-2 ring-cyan-400/40" /> Charted — buyers can move deals</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-500" /> Uncharted — no buyers yet</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-400/40" /> Buyer buy-box ({buyerPoints.length})</span>
        <span className="text-slate-400">· dot color = pull coverage · size = deals</span>
        <span className="ml-auto rounded-full bg-cyan-500/20 px-2.5 py-1 font-bold text-cyan-300 ring-1 ring-cyan-500/30">{charted}/{markets.length} charted</span>
      </div>
      {canEdit && (
        <div className="mb-1 flex flex-wrap items-center gap-2 px-1 text-[11px]">
          <button onClick={runGeocode} disabled={geoBusy} className="rounded-lg bg-cyan-600 px-2.5 py-1 font-bold text-white hover:bg-cyan-700 disabled:opacity-50">{geoBusy ? "Mapping…" : geocodeRemaining > 0 ? `🔄 Map buyer areas (${geocodeRemaining} left)` : "🔄 Re-map buyer areas"}</button>
          {geoMsg && <span className="text-slate-400">{geoMsg}</span>}
          {!geoMsg && geocodeRemaining > 0 && <span className="text-amber-400">{geocodeRemaining} buyer areas not on the map yet — click to plot them (free, one-time).</span>}
        </div>
      )}
      <div ref={ref} className="h-[460px] w-full overflow-hidden rounded-xl" style={{ background: "#0b1220" }} />
      <p className="mt-1 px-1 text-[10px] text-slate-500">Click a market for coverage, buyers, and momentum. Glowing = you have buyers there; dim = open territory to go win buyers first.</p>
    </div>
  );
}
