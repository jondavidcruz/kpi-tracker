"use client";
// 🗺 Phase 2 — a Florida map of the target markets, projected from lat/lng. Markers are
// colored by pull-coverage (clear / cooldown / never) and sized by deals produced, with the
// owner's 30-60-180 trend as a small badge. Pure inline SVG — no map library.
import { useState } from "react";
import type { MarketView } from "@/components/MarketsBoard";

// Projection box (a little padding inside the viewBox).
const VB_W = 460, VB_H = 420, PAD = 16;
const LNG_MIN = -87.8, LNG_MAX = -79.8, LAT_MIN = 24.3, LAT_MAX = 31.2;
function project(lat: number, lng: number): [number, number] {
  const x = PAD + ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * (VB_W - 2 * PAD);
  const y = PAD + ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (VB_H - 2 * PAD);
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

// Simplified Florida outline as lat/lng vertices (clockwise from the NW panhandle) — projected
// with the same transform so markers sit correctly on the shape.
const OUTLINE: [number, number][] = [
  [31.0, -87.6], [31.0, -85.0], [30.75, -82.2], [30.8, -81.6], [30.1, -81.4],
  [28.5, -80.55], [27.2, -80.1], [26.5, -80.05], [25.8, -80.1], [25.2, -80.4],
  [25.1, -81.1], [25.8, -81.5], [26.4, -81.9], [27.3, -82.6], [28.1, -82.7],
  [29.0, -82.8], [29.7, -83.5], [30.0, -84.4], [29.6, -85.4], [30.3, -86.6], [30.35, -87.5],
];
const OUTLINE_PATH = OUTLINE.map(([la, ln], i) => `${i ? "L" : "M"}${project(la, ln).join(" ")}`).join(" ") + " Z";

// Market centroids (keyed by the seeded market name) — approximate metro centers.
const COORDS: Record<string, [number, number]> = {
  "Miami / Coral Gables": [25.72, -80.26],
  "Palm Beach / West Palm Beach": [26.71, -80.06],
  "Boca Raton / Fort Lauderdale": [26.3, -80.12],
  "Naples / Port Royal": [26.14, -81.79],
  "Orlando / Windermere / Winter Park": [28.5, -81.5],
  "Tampa Bay": [27.95, -82.46],
  "Sarasota / Lakewood Ranch": [27.36, -82.53],
  "Jacksonville / Ponte Vedra": [30.24, -81.45],
  "Jupiter Island / Vero Beach": [27.5, -80.33],
  "30A / Alys Beach (NW Florida)": [30.3, -86.0],
};

const COV_COLOR: Record<MarketView["coverage"]["status"], string> = {
  never: "#94a3b8",    // slate — open field
  clear: "#10b981",    // emerald — clear to pull
  cooldown: "#f59e0b", // amber — cooldown
};

export default function FloridaMarketMap({ markets }: { markets: MarketView[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const placed = markets.filter((v) => COORDS[v.m.name]);
  const maxDeals = Math.max(1, ...placed.map((v) => v.deals));

  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COV_COLOR.clear }} /> Clear to pull</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COV_COLOR.cooldown }} /> Cooldown</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COV_COLOR.never }} /> Never pulled</span>
        <span className="ml-auto text-slate-400">dot size = deals · 🌊 = waterfront</span>
      </div>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-auto w-full" role="img" aria-label="Florida target-market coverage map">
        <path d={OUTLINE_PATH} fill="#f0f9ff" stroke="#bae6fd" strokeWidth={1.5} />
        {placed.map((v) => {
          const [la, ln] = COORDS[v.m.name];
          const [x, y] = project(la, ln);
          const r = 6 + (v.deals / maxDeals) * 12;
          const on = hover === v.m.name;
          return (
            <g key={v.m.id} onMouseEnter={() => setHover(v.m.name)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
              <circle cx={x} cy={y} r={r} fill={COV_COLOR[v.coverage.status]} fillOpacity={on ? 0.95 : 0.65} stroke="#fff" strokeWidth={1.5} />
              {v.m.trend === "up" && <text x={x} y={y - r - 2} textAnchor="middle" fontSize={11}>📈</text>}
              <text x={x} y={y + 3} textAnchor="middle" fontSize={9} fontWeight={800} fill="#0f172a">{v.deals || ""}</text>
              {on && (
                <g>
                  <rect x={x + r + 4} y={y - 26} width={168} height={52} rx={6} fill="#0f172a" fillOpacity={0.92} />
                  <text x={x + r + 12} y={y - 12} fontSize={10} fontWeight={800} fill="#fff">{v.m.name.split(" / ")[0]} {v.m.waterfront ? "🌊" : ""}</text>
                  <text x={x + r + 12} y={y + 1} fontSize={9} fill="#cbd5e1">{v.coverage.status === "never" ? "Never pulled" : v.coverage.status === "clear" ? `Clear · last ${v.coverage.lastPull}` : `Cooldown ${v.coverage.cooldownLeft}d`}</text>
                  <text x={x + r + 12} y={y + 13} fontSize={9} fill="#cbd5e1">{v.deals} deals · {v.leads} leads · W{v.m.wealth}/B{v.m.business}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-center text-[10px] text-slate-400">Hover a market for coverage &amp; performance. Positions are approximate metro centers.</p>
    </div>
  );
}
