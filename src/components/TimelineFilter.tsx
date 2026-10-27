"use client";
// 🗂 Filter the lead timeline between All / Notes / Activity (Jon 2026-10-27: "sometimes we
// are hunting to find all the notes"). Rows are tagged [data-note] by the server; this just
// toggles a class so nothing re-renders (the note editors + audio players stay mounted).
import { useState } from "react";

export default function TimelineFilter({ children }: { children: React.ReactNode }) {
  const [f, setF] = useState<"all" | "notes" | "activity">("all");
  const Btn = ({ k, label }: { k: "all" | "notes" | "activity"; label: string }) => (
    <button type="button" onClick={() => setF(k)}
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${f === k ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>
  );
  return (
    <div>
      <div className="mb-1.5 flex gap-1">
        <Btn k="all" label="All" />
        <Btn k="notes" label="📝 Notes" />
        <Btn k="activity" label="📞 Activity" />
      </div>
      <div data-filter={f} className="tlf">{children}</div>
      <style>{`.tlf[data-filter="notes"] [data-tlrow][data-note="0"]{display:none}.tlf[data-filter="activity"] [data-tlrow][data-note="1"]{display:none}`}</style>
    </div>
  );
}
