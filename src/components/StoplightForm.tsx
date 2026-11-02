"use client";

import { useState } from "react";
import { submitStoplight } from "@/app/actions";

type Light = "green" | "yellow" | "red";
const OPTS: { c: Light; emoji: string; label: string; meaning: string; ring: string; bg: string }[] = [
  { c: "green", emoji: "🟢", label: "Green", meaning: "Everything is good — on track to deliver.", ring: "ring-emerald-500", bg: "bg-emerald-50" },
  { c: "yellow", emoji: "🟡", label: "Yellow", meaning: "Something's not working — we need help fixing it.", ring: "ring-amber-500", bg: "bg-amber-50" },
  { c: "red", emoji: "🔴", label: "Red", meaning: "Stop — a change is needed.", ring: "ring-red-500", bg: "bg-red-50" },
];
const PROMPT: Record<Light, string> = {
  green: "",
  yellow: "What's not working, and what help do you need?",
  red: "What needs to change, and who needs to own it?",
};

export default function StoplightForm({ initial, note, greenWhy, behind, err }: {
  initial: Light | null; note: string; greenWhy: string; behind: string[]; err?: string;
}) {
  const [color, setColor] = useState<Light | null>(initial);
  const needWhy = color === "green" && behind.length > 0;
  return (
    <form action={submitStoplight} className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {OPTS.map((o) => (
          <label key={o.c} className={`cursor-pointer rounded-xl p-3 ring-1 transition ${color === o.c ? `ring-2 ${o.ring} ${o.bg}` : "ring-slate-200 hover:bg-slate-50"}`}>
            <input type="radio" name="color" value={o.c} checked={color === o.c} onChange={() => setColor(o.c)} className="sr-only" />
            <div className="text-lg font-bold">{o.emoji} {o.label}</div>
            <div className="text-xs text-slate-500">{o.meaning}</div>
          </label>
        ))}
      </div>

      {color && color !== "green" && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">{PROMPT[color]} <span className="text-red-500">*</span></label>
          <textarea name="note" required defaultValue={note} rows={3} maxLength={500}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            placeholder={color === "red" ? "e.g. Lead flow dried up — need to change the list we're calling. Jon to decide on new list." : "e.g. Buyers aren't responding to the new blast — need help rewriting it."} />
          <p className="mt-1 text-[11px] text-slate-400">This becomes an item on the Issues list so we solve it in the meeting.</p>
        </div>
      )}

      {needWhy && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Your KPIs show behind pace ({behind.join(", ")}). What makes this week green? <span className="text-red-500">*</span></label>
          <input name="greenWhy" required defaultValue={greenWhy} maxLength={500}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            placeholder="e.g. Spent the week building the new buyer list — numbers land next week." />
        </div>
      )}

      {err && <p className="text-sm font-semibold text-red-600">{err === "note" ? "Add a note for yellow/red." : err === "why" ? "Add a line on what makes it green." : "Pick a color."}</p>}

      <button disabled={!color} className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700 disabled:opacity-40">
        {initial ? "Update my stoplight" : "Submit my stoplight"}
      </button>
    </form>
  );
}
