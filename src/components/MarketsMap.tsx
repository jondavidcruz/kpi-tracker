"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Buyer = {
  id: string; name: string; category: string; type: string; region: string; market: string;
  status: string; email: string; phone: string; website: string; buyBox: string; buyBoxAreas: string;
  lat: number | null; lng: number | null; notes: string;
};

const REGION = {
  SD: { name: "San Diego Co.", color: "#2563eb" },
  OC: { name: "Orange Co.", color: "#ea580c" },
  LA: { name: "Los Angeles", color: "#16a34a" },
  other: { name: "Other / TBD", color: "#64748b" },
} as Record<string, { name: string; color: string }>;

// Load Leaflet (CSS + JS) from CDN exactly once.
let leafletPromise: Promise<unknown> | null = null;
function loadLeaflet(): Promise<unknown> {
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve) => {
    if (typeof document === "undefined") return;
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.setAttribute("data-leaflet", "1");
      document.head.appendChild(link);
    }
    // @ts-expect-error global L
    if (window.L) return resolve(window.L);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    // @ts-expect-error global L
    s.onload = () => resolve(window.L);
    document.body.appendChild(s);
  });
  return leafletPromise;
}

export default function MarketsMap({ buyers }: { buyers: Buyer[] }) {
  const [query, setQuery] = useState("");
  const [regions, setRegions] = useState<Set<string>>(new Set(["SD", "OC", "LA", "other"]));
  const [cats, setCats] = useState<Set<string>>(new Set(["luxury", "distressed"]));
  const mapEl = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return buyers.filter((b) => {
      if (!regions.has(b.region || "other")) return false;
      if (!cats.has(b.category)) return false;
      if (!q) return true;
      const hay = `${b.name} ${b.market} ${b.buyBoxAreas} ${b.notes} ${REGION[b.region]?.name ?? ""} ${b.region}`.toLowerCase();
      return hay.includes(q);
    });
  }, [buyers, query, regions, cats]);

  // Init map once.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const LL = L as any;
      if (cancelled || !mapEl.current || mapRef.current) return;
      const map = LL.map(mapEl.current, { zoomControl: true }).setView([33.6, -117.6], 8);
      LL.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO", subdomains: "abcd", maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = LL.layerGroup().addTo(map);
      renderPins(LL);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render pins when the filtered set changes.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const LL = (typeof window !== "undefined" ? (window as any).L : null);
    if (LL && layerRef.current) renderPins(LL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderPins(LL: any) {
    layerRef.current.clearLayers();
    const groups: Record<string, { lat: number; lng: number; items: Buyer[] }> = {};
    for (const b of filtered) {
      if (b.lat == null || b.lng == null) continue;
      const key = `${b.lat.toFixed(3)},${b.lng.toFixed(3)}`;
      (groups[key] ||= { lat: b.lat, lng: b.lng, items: [] }).items.push(b);
    }
    for (const k in groups) {
      const g = groups[k];
      const color = REGION[g.items[0].region]?.color ?? "#64748b";
      const m = LL.circleMarker([g.lat, g.lng], { radius: 9 + Math.min(g.items.length * 3, 16), color: "#fff", weight: 2, fillColor: color, fillOpacity: 0.85 }).addTo(layerRef.current);
      const pop = g.items.map((b) => {
        const ph = b.phone ? `<a href="tel:${b.phone.replace(/[^+\d]/g, "")}">${b.phone}</a>` : "";
        const em = b.email ? `<a href="mailto:${b.email}">${b.email}</a>` : "";
        const web = b.website ? `<a href="https://${b.website.replace(/^https?:\/\//, "")}" target="_blank" rel="noopener">site</a>` : "";
        return `<div style="padding:5px 0;border-top:1px solid #eee;"><b>${b.name}</b> <span style="font-size:10px;color:#64748b;">${b.status}</span><br><span style="font-size:11px;color:#64748b;">${[ph, em, web].filter(Boolean).join(" · ")}</span>${b.notes ? `<br><span style="font-size:11px;color:#64748b;font-style:italic;">${b.notes}</span>` : ""}</div>`;
      }).join("");
      m.bindPopup(`<div style="min-width:220px;"><div style="font-weight:700;">${g.items[0].market} (${g.items.length})</div>${pop}</div>`, { maxWidth: 320 });
      m.bindTooltip(`${g.items[0].market} (${g.items.length})`, { direction: "top" });
    }
  }

  const toggle = (set: Set<string>, val: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    setter(next);
  };

  function flyTo(b: Buyer) {
    if (b.lat != null && b.lng != null && mapRef.current) mapRef.current.setView([b.lat, b.lng], 12, { animate: true });
  }

  const byRegion = filtered.reduce((a, b) => { const r = b.region || "other"; a[r] = (a[r] || 0) + 1; return a; }, {} as Record<string, number>);

  return (
    <div>
      {/* Search */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔎 Type a county, city, or neighborhood (e.g. Newport Beach, OC, La Jolla)…"
          className="min-w-64 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{filtered.length} match{filtered.length === 1 ? "" : "es"}</span>
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        {(["SD", "OC", "LA", "other"] as const).map((r) => (
          <button key={r} onClick={() => toggle(regions, r, setRegions)} className={`rounded-full px-2.5 py-1 font-semibold ring-1 ${regions.has(r) ? "text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200"}`} style={regions.has(r) ? { background: REGION[r].color } : {}}>{REGION[r].name}</button>
        ))}
        <span className="mx-1 text-slate-300">|</span>
        <button onClick={() => toggle(cats, "luxury", setCats)} className={`rounded-full px-2.5 py-1 font-semibold ring-1 ${cats.has("luxury") ? "bg-brand-navy text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200"}`}>🏛 Luxury / Developers</button>
        <button onClick={() => toggle(cats, "distressed", setCats)} className={`rounded-full px-2.5 py-1 font-semibold ring-1 ${cats.has("distressed") ? "bg-amber-500 text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200"}`}>🔨 Distressed / Flippers</button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
        {/* Map */}
        <div ref={mapEl} className="h-[460px] w-full overflow-hidden rounded-xl ring-1 ring-slate-200" />

        {/* Rolodex (synced to the search/filters) */}
        <div className="max-h-[460px] overflow-y-auto rounded-xl ring-1 ring-slate-200">
          <div className="sticky top-0 flex gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
            {Object.keys(byRegion).map((r) => <span key={r}><span className="text-slate-800">{byRegion[r]}</span> {REGION[r]?.name ?? r}</span>)}
          </div>
          {filtered.length === 0 && <div className="p-6 text-center text-sm text-slate-400">No buyers match — try a broader area.</div>}
          {filtered.map((b) => (
            <button key={b.id} onClick={() => flyTo(b)} className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: REGION[b.region]?.color ?? "#64748b" }} />
                <span className="flex-1 text-sm font-semibold text-slate-800">{b.name}</span>
                {b.status && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{b.status}</span>}
              </div>
              <div className="ml-4 text-[11px] text-slate-500">{b.market}{b.type ? ` · ${b.type}` : ""}{b.buyBoxAreas ? ` · 🎯 ${b.buyBoxAreas}` : ""}</div>
              {(b.phone || b.email) && <div className="ml-4 text-[11px] text-brand-navy">{[b.phone, b.email].filter(Boolean).join(" · ")}</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
