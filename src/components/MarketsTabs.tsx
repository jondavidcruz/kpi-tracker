"use client";
// 🗂 Top-level tabs for /markets (Jon 2026-11-08: "there's a lot of stuff on this — break it into
// multiple tabs, with the MAP being the first thing you see, make it visually easy"). Shows ONE
// section at a time instead of a long scroll. Map is the default landing tab (the priority view).
// Each panel is passed as an already-built element and only the active one is rendered/mounted —
// so switching tabs is instant and the page stays light. Pure reorganization of existing surfaces.
import { useState, type ReactNode } from "react";

type TabDef = { key: string; label: string; hint: string; node: ReactNode };

export default function MarketsTabs({
  map, research, finder, showResearch = true,
}: { map: ReactNode; research?: ReactNode; finder: ReactNode; showResearch?: boolean }) {
  const tabs: TabDef[] = [
    { key: "map", label: "🗺 Map", hint: "The live satellite map — opportunity, buyer coverage, and your territories.", node: map },
    ...(showResearch && research
      ? [{ key: "research", label: "🔬 Research", hint: "Pull where your buyers are hungry — dial a buy-box and watch live motivated-owner counts.", node: research }]
      : []),
    { key: "finder", label: "🔎 Finder", hint: "Scan every FL & SC county from public data to discover the next high-margin market.", node: finder },
  ];
  const [active, setActive] = useState("map");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      <div className="flex flex-wrap items-end gap-1.5 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`-mb-px rounded-t-xl px-4 py-2.5 text-sm font-extrabold transition ${
              active === t.key
                ? "border-x border-t border-slate-200 bg-white text-brand-navy shadow-[0_-2px_8px_rgba(0,0,0,0.04)]"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mb-4 mt-2 text-[12px] text-slate-500">{current.hint}</p>
      <div>{current.node}</div>
    </div>
  );
}
