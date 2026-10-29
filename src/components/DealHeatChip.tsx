"use client";
// 🔥 Spread rating chip (Jon 2026-10-29) — the same control that's on the board cards, for the
// Quick Notes + full lead headers. One click cycles big → med → small → thin → unrated.
import { useState, useTransition } from "react";
import { HEAT_META, cycleHeat, type DealHeat } from "@/lib/deal-heat";
import { setDealHeatAction } from "@/app/crm/actions";

export default function DealHeatChip({ oppId, heat, size = "sm", onChanged }: {
  oppId: string; heat: DealHeat | ""; size?: "sm" | "md"; onChanged?: (h: DealHeat | "") => void;
}) {
  const [cur, setCur] = useState<DealHeat | "">(heat);
  const [, start] = useTransition();
  const m = cur ? HEAT_META[cur] : null;
  const pad = size === "md" ? "px-2.5 py-1 text-[11px]" : "px-1.5 py-0.5 text-[9px]";
  const bump = () => {
    const next = cycleHeat(cur);
    setCur(next);
    onChanged?.(next);
    const fd = new FormData(); fd.set("oppId", oppId); fd.set("heat", next);
    start(() => { setDealHeatAction(fd); });
  };
  return (
    <button type="button" onClick={bump}
      title={m ? `Spread: ${m.label} — click to change` : "Rate this deal's potential spread (from the comps) — click to set 🔥🔥🔥 big → 🔥🔥 med → 🔥 small → 🧊 thin"}
      className={`shrink-0 rounded-full font-bold ring-1 ${pad} ${m ? m.cls : "bg-white text-slate-300 ring-slate-200 hover:text-amber-500 hover:ring-amber-300"}`}>
      {m ? `${m.emoji} ${m.short}` : "🔥 rate spread"}
    </button>
  );
}
