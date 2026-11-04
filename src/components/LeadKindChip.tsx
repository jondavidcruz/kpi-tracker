"use client";
// 🏞🏡 Land / House chip (Jon 2026-11-04). Auto-detection reads whichever details form
// has more type-specific fields filled — but a brand-new land lead with only an address
// gets mis-read as a house. This chip lets a rep set it by hand. One click cycles:
//   auto → 🏞 Land → 🏡 House → auto.  "auto" clears the override and lets the system detect.
import { useState, useTransition } from "react";
import { setLeadKindAction } from "@/app/crm/actions";

type Override = "" | "land" | "home"; // "" = auto (no manual override)

const NEXT: Record<Override, Override> = { "": "land", land: "home", home: "" };

export default function LeadKindChip({ oppId, override, detected, size = "sm", onChanged }: {
  oppId: string;
  override: Override;        // the saved manual override (formData.__leadKind), "" if none
  detected: "land" | "home" | ""; // what auto-detection resolves to (for the "(auto)" display)
  size?: "sm" | "md";
  onChanged?: (o: Override) => void;
}) {
  const [cur, setCur] = useState<Override>(override);
  const [, start] = useTransition();
  const pad = size === "md" ? "px-2.5 py-1 text-[11px]" : "px-1.5 py-0.5 text-[9px]";

  // What the chip shows: manual override wins, else the detected kind, else a prompt.
  const shown = cur || detected;
  const manual = cur !== "";
  const face = shown === "land"
    ? { emoji: "🏞", label: "Land", cls: "bg-lime-100 text-lime-700 ring-lime-200" }
    : shown === "home"
    ? { emoji: "🏡", label: "House", cls: "bg-orange-100 text-orange-700 ring-orange-200" }
    : { emoji: "❓", label: "Land / House", cls: "bg-white text-slate-400 ring-slate-200 hover:text-slate-600" };

  const bump = () => {
    const next = NEXT[cur];
    setCur(next);
    onChanged?.(next);
    const fd = new FormData(); fd.set("oppId", oppId); fd.set("kind", next || "auto");
    start(() => { setLeadKindAction(fd); });
  };

  return (
    <button type="button" onClick={bump}
      title={manual ? `Set by hand as ${face.label}. Click to change (→ ${NEXT[cur] === "" ? "auto-detect" : NEXT[cur] === "land" ? "Land" : "House"}).` : shown ? `Auto-detected as ${face.label}. Click to set it by hand.` : "Not detected yet — click to mark this Land or House."}
      className={`shrink-0 rounded-full font-bold ring-1 ${pad} ${face.cls}`}>
      {face.emoji} {face.label}{manual ? " 🖐" : shown ? " · auto" : ""}
    </button>
  );
}
