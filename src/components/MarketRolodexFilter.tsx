"use client";

import { useState } from "react";

// Client-side filter for the buyer rolodex. The server renders every card (with
// its edit form intact); this shows/hides them by search text + vetting stage.
const STAGES: [string, string][] = [
  ["", "All stages"],
  ["to_vet", "To vet"],
  ["vetted", "Vetted"],
  ["active", "Active"],
  ["hold", "On hold"],
  ["dead", "Dead"],
];

export default function MarketRolodexFilter() {
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");

  function apply(nextQ: string, nextStage: string) {
    if (typeof document === "undefined") return;
    const query = nextQ.trim().toLowerCase();
    const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-mc-card]"));
    let shown = 0;
    for (const c of cards) {
      const hay = c.getAttribute("data-search") || "";
      const st = c.getAttribute("data-stage") || "";
      const vis = (!query || hay.includes(query)) && (!nextStage || st === nextStage);
      c.style.display = vis ? "" : "none";
      if (vis) shown++;
    }
    const empty = document.querySelector<HTMLElement>("[data-mc-empty]");
    if (empty) empty.style.display = shown ? "none" : "";
  }

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold transition ${active ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`;

  return (
    <div className="mb-3 space-y-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); apply(e.target.value, stage); }}
          placeholder="Search buyers by name, company, area, buy box…"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STAGES.map(([v, l]) => (
          <button key={v || "all"} type="button" onClick={() => { setStage(v); apply(q, v); }} className={chip(stage === v)}>{l}</button>
        ))}
      </div>
      <div data-mc-empty style={{ display: "none" }} className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-400">No buyers match.</div>
    </div>
  );
}
