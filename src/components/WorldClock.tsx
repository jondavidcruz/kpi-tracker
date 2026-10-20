"use client";
// 🕑 World clock for the markets we work + the Philippines team (Jon 2026-10-20).
// Compact row in the sidebar so it's always visible but never in the way. The team
// works PST; our deals are in CA (PT), TX/TN/OK (CT) and FL (ET).
import { useEffect, useState } from "react";

const ZONES: { label: string; tz: string }[] = [
  { label: "PT", tz: "America/Los_Angeles" }, // team + CA
  { label: "MT", tz: "America/Denver" },       // AZ/CO markets
  { label: "CT", tz: "America/Chicago" },      // TX · TN · OK
  { label: "ET", tz: "America/New_York" },     // FL
  { label: "PH", tz: "Asia/Manila" },          // 🇵🇭 our VAs
];

export default function WorldClock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const fmt = (tz: string) => (now == null ? "—" : new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(now));

  return (
    <div className="mt-2.5 grid grid-cols-5 gap-1 rounded-lg bg-white/5 px-1.5 py-1.5 ring-1 ring-white/10" title="Market time zones + Philippines">
      {ZONES.map((z) => (
        <div key={z.label} className="text-center leading-tight">
          <div className="text-[8.5px] font-bold uppercase tracking-wide text-brand-navy-300">{z.label === "PH" ? "🇵🇭" : z.label}</div>
          <div className="text-[10px] font-extrabold tabular-nums text-white">{fmt(z.tz)}</div>
        </div>
      ))}
    </div>
  );
}
