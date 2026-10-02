"use client";
// Apple-style segmented tabs for long pages (Jon 2026-10-01: "clean like an
// Apple website, not one continuous scroll"). All panes stay mounted — hidden
// with CSS — so server-rendered forms keep their state and nothing refetches.
import { useEffect, useState, type ReactNode } from "react";

export type TabDef = { key: string; label: string; badge?: string | number };

export default function PageTabs({ id, tabs, children }: { id: string; tabs: TabDef[]; children: ReactNode[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const storageKey = `pageTabs:${id}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && tabs.some((t) => t.key === saved)) setActive(saved);
    } catch { /* default tab */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (key: string) => {
    setActive(key);
    try { localStorage.setItem(storageKey, key); } catch { /* fine */ }
  };

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-1 mb-5 bg-slate-50/90 px-1 py-2 backdrop-blur">
        <div className="mx-auto flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl bg-slate-200/70 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => pick(t.key)}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${
                active === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
              {t.badge != null && t.badge !== 0 && t.badge !== "" && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active === t.key ? "bg-slate-100 text-slate-600" : "bg-slate-300/60 text-slate-600"}`}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      {tabs.map((t, i) => (
        <div key={t.key} className={active === t.key ? "space-y-6" : "hidden"}>{children[i]}</div>
      ))}
    </div>
  );
}
