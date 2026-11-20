"use client";

import { useState } from "react";
import { submitStoplight } from "@/app/actions";

type Light = "green" | "yellow" | "red";
const OPTS: { c: Light; emoji: string; label: string; meaning: string; ring: string; ph: string }[] = [
  { c: "green", emoji: "🟢", label: "Green", meaning: "On track — what's going well.", ring: "focus:ring-emerald-300", ph: "e.g. Buyer list build is on schedule — numbers land next week." },
  { c: "yellow", emoji: "🟡", label: "Yellow", meaning: "Not working — what help do you need?", ring: "focus:ring-amber-300", ph: "e.g. Buyers aren't responding to the new blast — need help rewriting it." },
  { c: "red", emoji: "🔴", label: "Red", meaning: "Stop — what needs to change, and who owns it?", ring: "focus:ring-red-300", ph: "e.g. Lead flow dried up — need to change the list we're calling. Jon to decide." },
];

export default function StoplightForm({ greenNote, yellowNote, redNote, behind, err }: {
  greenNote: string; yellowNote: string; redNote: string; behind: string[]; err?: string;
}) {
  const [g, setG] = useState(greenNote);
  const [y, setY] = useState(yellowNote);
  const [r, setR] = useState(redNote);
  const vals: Record<Light, [string, (v: string) => void]> = { green: [g, setG], yellow: [y, setY], red: [r, setR] };
  const any = !!(g.trim() || y.trim() || r.trim());
  const overall: Light | null = r.trim() ? "red" : y.trim() ? "yellow" : g.trim() ? "green" : null;
  const needGreen = behind.length > 0 && !y.trim() && !r.trim();
  const hadPrev = !!(greenNote || yellowNote || redNote);
  return (
    <form action={submitStoplight} className="space-y-4">
      <p className="text-xs text-slate-500">Write a note under any colour that applies — like a real stoplight. Your overall light = the most serious one you flag.</p>
      <div className="space-y-3">
        {OPTS.map((o) => {
          const [val, set] = vals[o.c];
          return (
            <div key={o.c} className="rounded-xl p-3 ring-1 ring-slate-200">
              <label className="mb-1 flex flex-wrap items-center gap-2 text-sm font-bold">{o.emoji} {o.label}<span className="text-xs font-normal text-slate-400">{o.meaning}</span>{o.c === "green" && needGreen && <span className="text-red-500">*</span>}</label>
              <textarea name={`${o.c}Note`} value={val} onChange={(e) => set(e.target.value)} rows={2} maxLength={500}
                className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 ${o.ring}`}
                placeholder={o.ph} />
            </div>
          );
        })}
      </div>

      {needGreen && <p className="text-[11px] text-amber-600">Your KPIs show behind pace ({behind.join(", ")}). Add a Green note on what makes this week green.</p>}
      <p className="text-[11px] text-slate-400">Anything in Yellow or Red becomes an item on the Issues list so we solve it in the meeting.</p>
      {overall && <p className="text-xs font-semibold text-slate-600">Overall this week: {overall === "green" ? "🟢 Green" : overall === "yellow" ? "🟡 Yellow" : "🔴 Red"}</p>}
      {err && <p className="text-sm font-semibold text-red-600">{err === "note" ? "Write a note under at least one colour." : err === "why" ? "Add a Green note on what makes it green." : "Add a note."}</p>}

      <button disabled={!any} className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700 disabled:opacity-40">
        {hadPrev ? "Update my stoplight" : "Submit my stoplight"}
      </button>
    </form>
  );
}
