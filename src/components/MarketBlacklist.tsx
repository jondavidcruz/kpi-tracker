"use client";
import { useState, useRef, useEffect } from "react";
import { addBlacklistAction, removeBlacklistAction } from "@/app/markets/actions";
import type { BlacklistEntry } from "@/lib/market-blacklist";

// ⛔ Areas not worth our time (Jon 2026-11-09). Manager-editable; everyone can see it.
export default function MarketBlacklist({ entries, canEdit }: { entries: BlacklistEntry[]; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  // 🔎 Geo-autocomplete on the Area field so typos get corrected to the real place name (Jon 2026-11-11).
  const [areaQ, setAreaQ] = useState("");
  const [sugs, setSugs] = useState<{ label: string; sub?: string }[]>([]);
  const sugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAreaChange = (v: string) => {
    setAreaQ(v);
    if (sugTimer.current) clearTimeout(sugTimer.current);
    if (v.trim().length < 3) { setSugs([]); return; }
    sugTimer.current = setTimeout(async () => {
      try { const r = await fetch(`/api/markets/geo-suggest?q=${encodeURIComponent(v.trim())}`); const j = await r.json(); setSugs(Array.isArray(j.items) ? j.items : []); } catch { setSugs([]); }
    }, 280);
  };
  // Clear the field once an add lands (entry count changes).
  useEffect(() => { setAreaQ(""); setSugs([]); }, [entries.length]);
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-red-200">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left">
        <span className="text-lg">⛔</span>
        <span className="text-sm font-extrabold text-slate-800">Blacklist — not worth our time ({entries.length})</span>
        <span className="ml-auto text-xs font-semibold text-slate-400">{open ? "Hide ▲" : "Show ▼"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-[12px] text-slate-500">
            Penny-lot / low-spread areas we skip. We want land that sells <b>above $50k</b> — cheap-lot markets
            (like Lehigh Acres) burn time for tiny spreads.
          </p>
          <div className="flex flex-wrap gap-2">
            {entries.length === 0 && <span className="text-[12px] text-slate-400">Nothing blacklisted yet.</span>}
            {entries.map((e) => (
              <div key={e.id} className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-[12px] ring-1 ring-red-200">
                <div className="min-w-0">
                  <div className="font-bold text-red-800">{e.area}</div>
                  {e.reason && <div className="text-red-600">{e.reason}</div>}
                  <div className="text-[10px] text-red-400">added by {e.by} · {e.at}</div>
                </div>
                {canEdit && (
                  <form action={removeBlacklistAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <button className="shrink-0 rounded-md px-1 text-red-400 hover:text-red-700" title="Remove from blacklist">✕</button>
                  </form>
                )}
              </div>
            ))}
          </div>
          {canEdit && (
            <form action={addBlacklistAction} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
              <div className="relative flex flex-col">
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Area</label>
                <input name="area" required value={areaQ} onChange={(e) => onAreaChange(e.target.value)} autoComplete="off" placeholder="Type a city/county — picks the real spelling" className="w-56 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
                {sugs.length > 0 && (
                  <div className="absolute left-0 top-full z-[600] mt-1 w-72 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-xl">
                    {sugs.map((s, i) => (
                      <button key={i} type="button" onClick={() => { setAreaQ(s.label); setSugs([]); }} className="block w-full px-3 py-1.5 text-left text-[12px] text-slate-700 hover:bg-slate-100">
                        <span className="font-semibold">{s.label}</span>{s.sub && <span className="ml-1 text-slate-400">· {s.sub}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Why (optional)</label>
                <input name="reason" placeholder="Why it's not worth it — e.g. land sells under $50k" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
              </div>
              <button className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700">⛔ Blacklist</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
