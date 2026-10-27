"use client";
// 🗂 Filter the lead timeline — All / Notes / SMS / Email / Calls (Jon 2026-10-27: "sometimes
// we are hunting to find all the notes", + SMS & email filters). Rows are tagged [data-kind]
// by the server; this just toggles a class so nothing re-renders (note editors + audio players
// stay mounted).
import { useState } from "react";

type F = "all" | "note" | "sms" | "email" | "call";

export default function TimelineFilter({ children }: { children: React.ReactNode }) {
  const [f, setF] = useState<F>("all");
  const Btn = ({ k, label }: { k: F; label: string }) => (
    <button type="button" onClick={() => setF(k)}
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${f === k ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>
  );
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap gap-1">
        <Btn k="all" label="All" />
        <Btn k="note" label="📝 Notes" />
        <Btn k="sms" label="💬 SMS" />
        <Btn k="email" label="✉️ Email" />
        <Btn k="call" label="📞 Calls" />
      </div>
      <div data-filter={f} className="tlf">{children}</div>
      <style>{`
        .tlf[data-filter="note"] [data-tlrow]:not([data-kind="note"]){display:none}
        .tlf[data-filter="sms"] [data-tlrow]:not([data-kind="sms"]){display:none}
        .tlf[data-filter="email"] [data-tlrow]:not([data-kind="email"]){display:none}
        .tlf[data-filter="call"] [data-tlrow]:not([data-kind="call"]):not([data-kind="voicemail"]){display:none}
      `}</style>
    </div>
  );
}
