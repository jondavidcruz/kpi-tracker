"use client";

import { useState } from "react";

// Client-side filter for the Software & Logins page. The server renders every
// card (with server actions + RevealSecret intact); this just shows/hides them
// by search text and category, and hides empty category groups.
export default function SoftwareControls({ categories }: { categories: string[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");

  function apply(nextQ: string, nextCat: string) {
    if (typeof document === "undefined") return;
    const query = nextQ.trim().toLowerCase();
    const groups = Array.from(document.querySelectorAll<HTMLElement>("[data-sw-group]"));
    let total = 0;
    for (const g of groups) {
      const gcat = g.getAttribute("data-sw-group") || "";
      const cards = Array.from(g.querySelectorAll<HTMLElement>("[data-sw-card]"));
      let shown = 0;
      for (const c of cards) {
        const hay = c.getAttribute("data-search") || "";
        const vis = (!query || hay.includes(query)) && (!nextCat || gcat === nextCat);
        c.style.display = vis ? "" : "none";
        if (vis) shown++;
      }
      g.style.display = shown ? "" : "none";
      const badge = g.querySelector<HTMLElement>("[data-sw-count]");
      if (badge) badge.textContent = String(shown);
      total += shown;
    }
    const empty = document.querySelector<HTMLElement>("[data-sw-empty]");
    if (empty) empty.style.display = total ? "none" : "";
  }

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold transition ${
      active ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  return (
    <div className="space-y-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); apply(e.target.value, cat); }}
          placeholder="Search by software, login, owner, plan…"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => { setCat(""); apply(q, ""); }} className={chip(cat === "")}>All</button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => { const n = cat === c ? "" : c; setCat(n); apply(q, n); }}
            className={chip(cat === c)}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
