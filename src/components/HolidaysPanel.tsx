"use client";
// 🎉 Federal holidays on the time card (Jon 2026-11-04). Shows what's coming so the team can
// see it (Thanksgiving, Christmas…). Managers flip each between "team off" and "working" — it
// is NOT automatic; the 3 majors default to off, the rest to working. Optimistic + saves live.
import { useState, useTransition } from "react";
import { setHolidayOffAction } from "@/app/actions";

type Row = { key: string; name: string; emoji: string; date: string; off: boolean };

function pretty(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  const wk = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const yr = d.getUTCFullYear();
  return `${wk}, ${md} ${yr}`;
}
function daysUntil(date: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400_000);
}

export default function HolidaysPanel({ holidays, canEdit }: { holidays: Row[]; canEdit: boolean }) {
  const [rows, setRows] = useState<Row[]>(holidays);
  const [, start] = useTransition();

  const toggle = (date: string) => {
    if (!canEdit) return;
    setRows((rs) => rs.map((r) => (r.date === date ? { ...r, off: !r.off } : r)));
    const next = !rows.find((r) => r.date === date)?.off;
    const fd = new FormData(); fd.set("date", date); fd.set("off", next ? "1" : "0");
    start(() => { setHolidayOffAction(fd); });
  };

  if (!rows.length) return null;
  return (
    <div className="space-y-1.5">
      {rows.map((h) => {
        const dte = daysUntil(h.date);
        const soon = dte >= 0 && dte <= 14;
        return (
          <div key={h.date} className={`flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ${h.off ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"}`}>
            <span className="text-lg">{h.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-slate-800">{h.name}{soon && <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{dte === 0 ? "today" : dte === 1 ? "tomorrow" : `in ${dte}d`}</span>}</div>
              <div className="text-[11px] text-slate-400">{pretty(h.date)}</div>
            </div>
            {canEdit ? (
              <button type="button" onClick={() => toggle(h.date)} className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold ring-1 transition ${h.off ? "bg-emerald-600 text-white ring-emerald-600 hover:opacity-90" : "bg-white text-slate-500 ring-slate-300 hover:bg-slate-50"}`}>
                {h.off ? "🏖 Day off" : "💼 Working"}
              </button>
            ) : (
              <span className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold ${h.off ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{h.off ? "🏖 Off" : "💼 Working"}</span>
            )}
          </div>
        );
      })}
      {canEdit && <p className="px-1 text-[10px] text-slate-400">Tap to flip a holiday between a team day off and a normal working day. New Year&apos;s, Thanksgiving &amp; Christmas default to off; everything else to working.</p>}
    </div>
  );
}
