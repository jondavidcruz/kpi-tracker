"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Buyer = {
  id: string; name: string; category: string; type: string; region: string; market: string;
  status: string; email: string; phone: string; website: string; buyBox: string; buyBoxAreas: string;
  lat: number | null; lng: number | null; notes: string; buyBoxMapUrl: string;
};

export type Market = { id: string; name: string; tier: string; score: number; lat: number | null; lng: number | null };

const TIER_COLOR: Record<string, string> = { S: "#b91c1c", "1": "#ea580c", "2": "#ca8a04", "3": "#2563eb" };
const TIER_RADIUS: Record<string, number> = { S: 34, "1": 28, "2": 22, "3": 16 };

// ── Our four main markets (Jon 2026-09-21) — everything organizes under these ──
const STATES: Record<string, { name: string; color: string; center: [number, number]; zoom: number }> = {
  CA: { name: "California", color: "#2563eb", center: [36.3, -119.6], zoom: 6 },
  TX: { name: "Texas", color: "#dc2626", center: [31.2, -99.2], zoom: 6 },
  FL: { name: "Florida", color: "#ea580c", center: [28.3, -82.4], zoom: 6 },
  TN: { name: "Tennessee", color: "#16a34a", center: [35.85, -86.35], zoom: 7 },
  other: { name: "Other", color: "#64748b", center: [38.5, -96.5], zoom: 4 },
};
const STATE_ORDER = ["CA", "TX", "FL", "TN", "other"];

// Rough state bounding boxes — lat/lng fallback when the text gives no state.
const STATE_BOUNDS: Record<string, [number, number, number, number]> = {
  CA: [32.4, 42.1, -124.6, -114.0],
  TX: [25.7, 36.6, -106.8, -93.4],
  FL: [24.4, 31.1, -87.7, -79.9],
  TN: [34.9, 36.8, -90.4, -81.5],
};

// City → county lookup per state, for the metros we actually hunt in. Lowercase keys.
const CITY_COUNTY: Record<string, Record<string, string>> = {
  CA: {
    "san diego": "San Diego", "chula vista": "San Diego", "escondido": "San Diego", "oceanside": "San Diego", "carlsbad": "San Diego", "el cajon": "San Diego", "la jolla": "San Diego", "encinitas": "San Diego", "la mesa": "San Diego", "santee": "San Diego", "vista": "San Diego", "poway": "San Diego",
    "newport beach": "Orange", "irvine": "Orange", "anaheim": "Orange", "santa ana": "Orange", "costa mesa": "Orange", "huntington beach": "Orange", "laguna beach": "Orange", "laguna niguel": "Orange", "orange": "Orange", "fullerton": "Orange", "tustin": "Orange", "corona del mar": "Orange",
    "los angeles": "Los Angeles", "long beach": "Los Angeles", "pasadena": "Los Angeles", "santa monica": "Los Angeles", "beverly hills": "Los Angeles", "torrance": "Los Angeles", "glendale": "Los Angeles", "burbank": "Los Angeles",
    "riverside": "Riverside", "corona": "Riverside", "temecula": "Riverside", "murrieta": "Riverside",
    "san bernardino": "San Bernardino", "fontana": "San Bernardino", "rancho cucamonga": "San Bernardino",
  },
  TX: {
    "houston": "Harris", "katy": "Harris", "cypress": "Harris", "spring": "Harris", "humble": "Harris", "tomball": "Harris", "pasadena": "Harris",
    "dallas": "Dallas", "garland": "Dallas", "irving": "Dallas", "mesquite": "Dallas",
    "fort worth": "Tarrant", "arlington": "Tarrant",
    "austin": "Travis", "san antonio": "Bexar",
    "plano": "Collin", "frisco": "Collin", "mckinney": "Collin",
    "denton": "Denton", "new braunfels": "Comal", "conroe": "Montgomery", "the woodlands": "Montgomery",
  },
  FL: {
    "orlando": "Orange", "kissimmee": "Osceola", "tampa": "Hillsborough", "st. petersburg": "Pinellas", "st petersburg": "Pinellas", "clearwater": "Pinellas",
    "jacksonville": "Duval", "miami": "Miami-Dade", "fort lauderdale": "Broward", "west palm beach": "Palm Beach",
    "ocala": "Marion", "palm bay": "Brevard", "melbourne": "Brevard", "cape coral": "Lee", "lehigh acres": "Lee", "fort myers": "Lee",
    "port charlotte": "Charlotte", "punta gorda": "Charlotte", "north port": "Sarasota", "sarasota": "Sarasota",
    "lakeland": "Polk", "deltona": "Volusia", "daytona beach": "Volusia", "palm coast": "Flagler", "gainesville": "Alachua",
    "spring hill": "Hernando", "interlachen": "Putnam", "citrus springs": "Citrus", "dunnellon": "Citrus",
  },
  TN: {
    "nashville": "Davidson", "antioch": "Davidson", "madison": "Davidson", "hermitage": "Davidson", "old hickory": "Davidson",
    "franklin": "Williamson", "brentwood": "Williamson", "spring hill": "Maury",
    "murfreesboro": "Rutherford", "smyrna": "Rutherford", "la vergne": "Rutherford",
    "hendersonville": "Sumner", "gallatin": "Sumner", "lebanon": "Wilson", "mt. juliet": "Wilson", "mount juliet": "Wilson",
    "knoxville": "Knox", "memphis": "Shelby", "chattanooga": "Hamilton", "clarksville": "Montgomery",
  },
};

const STATE_TEXT: [RegExp, string][] = [
  [/,\s*ca\b|\bcalifornia\b/, "CA"], [/,\s*tx\b|\btexas\b/, "TX"],
  [/,\s*fl\b|\bflorida\b/, "FL"], [/,\s*tn\b|\btennessee\b/, "TN"],
];

/** Which of our states a buyer belongs to — from text, the legacy region, or coordinates. */
function stateOf(b: Buyer): string {
  const hay = `${b.market} ${b.buyBoxAreas} ${b.notes}`.toLowerCase();
  for (const [re, st] of STATE_TEXT) if (re.test(hay)) return st;
  if (["SD", "OC", "LA"].includes(b.region)) return "CA";
  if (b.region === "TN") return "TN";
  if (b.lat != null && b.lng != null) {
    for (const st of ["CA", "TX", "FL", "TN"]) {
      const [s, n, w, e] = STATE_BOUNDS[st];
      if (b.lat >= s && b.lat <= n && b.lng >= w && b.lng <= e) return st;
    }
  }
  return "other";
}

/** County bucket within a state — explicit "X County" text wins, then the legacy
 *  region (SD/OC/LA are counties), then the city lookup, then the market city. */
function countyOf(b: Buyer, st: string): string {
  const hay = `${b.buyBoxAreas} ${b.market} ${b.notes}`;
  const m = hay.match(/([A-Za-z.\- ]+?)\s+County/i);
  if (m) return m[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
  if (st === "CA") {
    if (b.region === "SD") return "San Diego";
    if (b.region === "OC") return "Orange";
    if (b.region === "LA") return "Los Angeles";
  }
  const lookup = CITY_COUNTY[st];
  const hayLc = hay.toLowerCase();
  if (lookup) {
    // Longest city names first so "west palm beach" wins over "palm beach"-ish fragments.
    for (const city of Object.keys(lookup).sort((a, z) => z.length - a.length)) {
      if (hayLc.includes(city)) return lookup[city];
    }
  }
  const cityFromMarket = (b.market || "").split(",")[0].trim();
  return cityFromMarket ? `${cityFromMarket} area` : "Unassigned";
}

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

export default function MarketsMap({ buyers, markets = [] }: { buyers: Buyer[]; markets?: Market[] }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<string>("all"); // all | CA | TX | FL | TN | other
  const [county, setCounty] = useState<string>(""); // "" = all counties in the state
  const [cats, setCats] = useState<Set<string>>(new Set(["luxury", "distressed"]));
  const [statuses, setStatuses] = useState<Set<string>>(new Set()); // empty = all
  const [preview, setPreview] = useState<Buyer | null>(null); // buy-box area map lightbox
  const allStatuses = useMemo(() => Array.from(new Set(buyers.map((b) => b.status).filter(Boolean))).sort(), [buyers]);
  const mapEl = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);

  // Tag every buyer with its state + county bucket once.
  const tagged = useMemo(() => buyers.map((b) => {
    const st = stateOf(b);
    return { b, st, county: countyOf(b, st) };
  }), [buyers]);

  const stateCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of tagged) c[t.st] = (c[t.st] || 0) + 1;
    return c;
  }, [tagged]);

  // Counties within the selected state (search/cat/status applied, county not).
  const preCounty = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tagged.filter((t) => {
      if (state !== "all" && t.st !== state) return false;
      if (!cats.has(t.b.category)) return false;
      if (statuses.size && !statuses.has(t.b.status)) return false;
      if (!q) return true;
      const hay = `${t.b.name} ${t.b.market} ${t.b.buyBoxAreas} ${t.b.notes} ${t.county} ${STATES[t.st].name}`.toLowerCase();
      return hay.includes(q);
    });
  }, [tagged, state, query, cats, statuses]);

  const countyCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const t of preCounty) c.set(t.county, (c.get(t.county) || 0) + 1);
    return [...c.entries()].sort((a, z) => z[1] - a[1]);
  }, [preCounty]);

  const filtered = useMemo(
    () => (county ? preCounty.filter((t) => t.county === county) : preCounty),
    [preCounty, county],
  );

  // Init map once — continental view over our four states.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const LL = L as any;
      if (cancelled || !mapEl.current || mapRef.current) return;
      const map = LL.map(mapEl.current, { zoomControl: true }).setView([34.5, -101], 4);
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
    // Market heat zones (under the developer pins, always shown).
    for (const mk of markets) {
      if (mk.lat == null || mk.lng == null) continue;
      const color = TIER_COLOR[mk.tier] ?? "#64748b";
      LL.circleMarker([mk.lat, mk.lng], { radius: TIER_RADIUS[mk.tier] ?? 18, color, weight: 1, fillColor: color, fillOpacity: 0.18 })
        .addTo(layerRef.current)
        .bindTooltip(`${mk.name} · Tier ${mk.tier} · ${mk.score}`, { direction: "top", permanent: false });
    }
    const groups: Record<string, { lat: number; lng: number; items: Buyer[]; st: string; county: string }> = {};
    for (const t of filtered) {
      const b = t.b;
      if (b.lat == null || b.lng == null) continue;
      const key = `${b.lat.toFixed(3)},${b.lng.toFixed(3)}`;
      (groups[key] ||= { lat: b.lat, lng: b.lng, items: [], st: t.st, county: t.county }).items.push(b);
    }
    for (const k in groups) {
      const g = groups[k];
      const color = STATES[g.st]?.color ?? "#64748b";
      const m = LL.circleMarker([g.lat, g.lng], { radius: 9 + Math.min(g.items.length * 3, 16), color: "#fff", weight: 2, fillColor: color, fillOpacity: 0.85 }).addTo(layerRef.current);
      const pop = g.items.map((b) => {
        const ph = b.phone ? `<a href="tel:${b.phone.replace(/[^+\d]/g, "")}">${b.phone}</a>` : "";
        const em = b.email ? `<a href="mailto:${b.email}">${b.email}</a>` : "";
        const web = b.website ? `<a href="https://${b.website.replace(/^https?:\/\//, "")}" target="_blank" rel="noopener">site</a>` : "";
        // Buy-box area map (Sharyn's detailed map) — thumbnail in the popup; click to open full.
        const mapImg = b.buyBoxMapUrl ? `<a href="${b.buyBoxMapUrl}" target="_blank" rel="noopener" style="display:block;margin-top:6px;"><img src="${b.buyBoxMapUrl}" alt="buy-box map" style="width:100%;max-width:280px;border-radius:6px;border:1px solid #ddd;"/><span style="font-size:10px;color:#4338ca;font-weight:600;">🗺️ Buy-box area — click to enlarge</span></a>` : "";
        return `<div style="padding:5px 0;border-top:1px solid #eee;"><b>${b.name}</b> <span style="font-size:10px;color:#64748b;">${b.status}</span><br><span style="font-size:11px;color:#64748b;">${[ph, em, web].filter(Boolean).join(" · ")}</span>${b.notes ? `<br><span style="font-size:11px;color:#64748b;font-style:italic;">${b.notes}</span>` : ""}${mapImg}</div>`;
      }).join("");
      const countyLabel = g.county.endsWith("area") || g.county === "Unassigned" ? g.county : `${g.county} County`;
      m.bindPopup(`<div style="min-width:220px;"><div style="font-weight:700;">${countyLabel} · ${g.items[0].market} (${g.items.length})</div>${pop}</div>`, { maxWidth: 320 });
      m.bindTooltip(`${g.items[0].market} (${g.items.length})`, { direction: "top" });
    }
  }

  const toggle = (set: Set<string>, val: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    setter(next);
  };

  function pickState(st: string) {
    const next = state === st ? "all" : st;
    setState(next);
    setCounty("");
    if (!mapRef.current) return;
    if (next === "all") mapRef.current.setView([34.5, -101], 4, { animate: true });
    else mapRef.current.setView(STATES[next].center, STATES[next].zoom, { animate: true });
  }

  function pickCounty(name: string) {
    const next = county === name ? "" : name;
    setCounty(next);
    if (!next || !mapRef.current) return;
    // Fly to the average position of that county's pins.
    const pins = preCounty.filter((t) => t.county === name && t.b.lat != null && t.b.lng != null);
    if (pins.length) {
      const lat = pins.reduce((s, t) => s + (t.b.lat as number), 0) / pins.length;
      const lng = pins.reduce((s, t) => s + (t.b.lng as number), 0) / pins.length;
      mapRef.current.setView([lat, lng], 9, { animate: true });
    }
  }

  function flyTo(b: Buyer) {
    if (b.lat != null && b.lng != null && mapRef.current) mapRef.current.setView([b.lat, b.lng], 12, { animate: true });
    if (b.buyBoxMapUrl) setPreview(b); // pop their detailed buy-box map
  }

  return (
    <div>
      {/* Search */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔎 Type a county, city, or builder (e.g. Davidson, Katy, Ocala)…"
          className="min-w-64 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{filtered.length} match{filtered.length === 1 ? "" : "es"}</span>
      </div>

      {/* Our 4 main markets — click a state to zoom + drill into its counties */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button onClick={() => pickState("all")} className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${state === "all" ? "bg-slate-900 text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200"}`}>
          All markets · {buyers.length}
        </button>
        {STATE_ORDER.map((st) => (
          (stateCounts[st] || st !== "other") && (
            <button
              key={st}
              onClick={() => pickState(st)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${state === st ? "text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200"}`}
              style={state === st ? { background: STATES[st].color } : {}}
            >
              {STATES[st].name} · {stateCounts[st] || 0}
            </button>
          )
        ))}
      </div>

      {/* County drill-down for the selected state */}
      {state !== "all" && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-2 ring-1 ring-slate-200">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{STATES[state].name} by county:</span>
          {countyCounts.length === 0 && <span className="text-xs text-slate-400">no developers here match the current filters</span>}
          {countyCounts.map(([name, n]) => (
            <button
              key={name}
              onClick={() => pickCounty(name)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${county === name ? "text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200"}`}
              style={county === name ? { background: STATES[state].color } : {}}
            >
              {name} · {n}
            </button>
          ))}
        </div>
      )}

      {/* Category + status filters */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        <button onClick={() => toggle(cats, "luxury", setCats)} className={`rounded-full px-2.5 py-1 font-semibold ring-1 ${cats.has("luxury") ? "bg-brand-navy text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200"}`}>🏛 Luxury / Developers</button>
        <button onClick={() => toggle(cats, "distressed", setCats)} className={`rounded-full px-2.5 py-1 font-semibold ring-1 ${cats.has("distressed") ? "bg-amber-500 text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200"}`}>🔨 Distressed / Flippers</button>
        {allStatuses.length > 0 && (
          <>
            <span className="mx-1 text-slate-300">|</span>
            <span className="font-semibold text-slate-400">Status:</span>
            <button onClick={() => setStatuses(new Set())} className={`rounded-full px-2.5 py-1 font-semibold ring-1 ${statuses.size === 0 ? "bg-slate-800 text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200"}`}>All</button>
            {allStatuses.map((s) => (
              <button key={s} onClick={() => toggle(statuses, s, setStatuses)} className={`rounded-full px-2.5 py-1 font-semibold ring-1 ${statuses.has(s) ? "bg-slate-800 text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200"}`}>{s}</button>
            ))}
          </>
        )}
      </div>

      {/* Jump to a target market */}
      {markets.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-slate-400">Jump to:</span>
          {markets.map((mk) => (
            <button
              key={mk.id}
              onClick={() => { if (mk.lat != null && mk.lng != null && mapRef.current) mapRef.current.setView([mk.lat, mk.lng], mk.tier === "S" || mk.tier === "2" ? 10 : 8, { animate: true }); }}
              className="rounded-full px-2.5 py-1 font-semibold text-white"
              style={{ background: TIER_COLOR[mk.tier] ?? "#64748b" }}
            >
              {mk.name.split(",")[0]} · {mk.score}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
        {/* Map */}
        <div ref={mapEl} className="h-[460px] w-full overflow-hidden rounded-xl ring-1 ring-slate-200" />

        {/* Rolodex (synced to the state/county/search filters) */}
        <div className="max-h-[460px] overflow-y-auto rounded-xl ring-1 ring-slate-200">
          <div className="sticky top-0 flex flex-wrap gap-x-3 gap-y-0.5 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
            {state === "all"
              ? STATE_ORDER.filter((st) => stateCounts[st]).map((st) => <span key={st}><span className="text-slate-800">{stateCounts[st]}</span> {STATES[st].name}</span>)
              : countyCounts.slice(0, 6).map(([name, n]) => <span key={name}><span className="text-slate-800">{n}</span> {name}</span>)}
          </div>
          {filtered.length === 0 && <div className="p-6 text-center text-sm text-slate-400">No buyers match — try a broader area.</div>}
          {filtered.map((t) => (
            <button key={t.b.id} onClick={() => flyTo(t.b)} className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATES[t.st]?.color ?? "#64748b" }} />
                <span className="flex-1 text-sm font-semibold text-slate-800">{t.b.name}</span>
                {t.b.buyBoxMapUrl && <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700" title="Has a buy-box area map">🗺️ map</span>}
                {t.b.status && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{t.b.status}</span>}
              </div>
              <div className="ml-4 text-[11px] text-slate-500">
                <span className="font-semibold" style={{ color: STATES[t.st]?.color }}>{t.county}{t.county.endsWith("area") ? "" : " Co."}</span>
                {` · ${t.b.market}`}{t.b.type ? ` · ${t.b.type}` : ""}{t.b.buyBoxAreas ? ` · 🎯 ${t.b.buyBoxAreas}` : ""}
              </div>
              {(t.b.phone || t.b.email) && <div className="ml-4 text-[11px] text-brand-navy">{[t.b.phone, t.b.email].filter(Boolean).join(" · ")}</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Buy-box area map lightbox — Sharyn's detailed map of exactly where this buyer buys. */}
      {preview && preview.buyBoxMapUrl && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4" onClick={() => setPreview(null)}>
          <div className="flex max-h-[92vh] max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
              <div>
                <div className="text-sm font-bold text-slate-800">🗺️ {preview.name} — buy-box area</div>
                <div className="text-[11px] text-slate-500">{[preview.market, preview.buyBoxAreas].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="flex items-center gap-2">
                <a href={preview.buyBoxMapUrl} target="_blank" rel="noopener" className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">Open full ↗</a>
                <button onClick={() => setPreview(null)} className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700">✕ Close</button>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.buyBoxMapUrl} alt={`${preview.name} buy-box area map`} className="max-h-[80vh] w-auto max-w-full object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
