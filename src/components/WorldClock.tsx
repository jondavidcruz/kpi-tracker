"use client";
// 🕑 World clock for the markets we actually operate in + the Philippines team
// (Jon 2026-10-20). Default = a compact strip with the STATES under each zone so
// nobody has to Google which market a zone is. Click it to expand into an
// Apple-clock-style panel: full zone name, states, big time, date, and the
// offset from the team (PT). Collapsed/expanded choice is remembered per viewer.
import { useEffect, useState } from "react";

// Only the zones we do deals in. PT = our team's clock too.
const ZONES: { abbr: string; flag?: string; zone: string; tz: string; states: string; short: string }[] = [
  { abbr: "PT", zone: "Pacific", tz: "America/Los_Angeles", states: "California", short: "CA" },
  { abbr: "CT", zone: "Central", tz: "America/Chicago", states: "Texas · Tennessee · Oklahoma", short: "TX·TN·OK" },
  { abbr: "ET", zone: "Eastern", tz: "America/New_York", states: "Florida", short: "FL" },
  { abbr: "PH", flag: "🇵🇭", zone: "Philippines", tz: "Asia/Manila", states: "Manila — Marie & Sharyn", short: "Team PH" },
];

const LS_KEY = "wr_worldclock_open";

// minutes east of PT for a given tz, "right now" — for the "+3h" style hint
function offsetFromPT(tz: string, now: number): number {
  const d = new Date(now);
  const mins = (z: string) => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: z, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
    const h = Number(p.find((x) => x.type === "hour")?.value ?? 0);
    const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
    return h * 60 + m;
  };
  let diff = mins(tz) - mins("America/Los_Angeles");
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return diff;
}

export default function WorldClock() {
  const [now, setNow] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setNow(Date.now());
    try { setOpen(localStorage.getItem(LS_KEY) === "1"); } catch { /* private mode */ }
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);

  const toggle = () => setOpen((v) => { const n = !v; try { localStorage.setItem(LS_KEY, n ? "1" : "0"); } catch { /* ignore */ } return n; });

  const time = (tz: string) => (now == null ? "—" : new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(now));
  const dayStr = (tz: string) => (now == null ? "" : new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(now));
  const offStr = (tz: string) => {
    if (now == null) return "";
    const o = offsetFromPT(tz, now);
    if (o === 0) return "team time";
    const h = o / 60;
    return `${h > 0 ? "+" : ""}${Number.isInteger(h) ? h : h.toFixed(1)}h vs PT`;
  };

  if (open) {
    // 🗂 Apple-clock-style expanded panel
    return (
      <div className="mt-2.5 rounded-lg bg-white/5 ring-1 ring-white/10">
        <button onClick={toggle} title="Collapse the clock" className="flex w-full items-center justify-between px-2.5 pt-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-brand-navy-300 hover:text-white">
          <span>🕑 Market clocks</span><span>▾ hide</span>
        </button>
        <div className="space-y-0.5 px-1.5 pb-1.5">
          {ZONES.map((z) => (
            <div key={z.abbr} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/5">
              <span className="w-7 shrink-0 text-center text-[11px] font-black text-white">{z.flag ?? z.abbr}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-bold leading-tight text-white">{z.states}</div>
                <div className="truncate text-[8.5px] font-medium leading-tight text-brand-navy-300">{z.zone} · {offStr(z.tz)}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[12px] font-extrabold tabular-nums leading-tight text-white">{time(z.tz)}</div>
                <div className="text-[8px] font-medium leading-tight text-brand-navy-300">{dayStr(z.tz)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 🔻 compact strip (default) — state codes under each zone so it's never ambiguous
  return (
    <button onClick={toggle} title="Click to expand — see states, dates & offsets" className="mt-2.5 block w-full rounded-lg bg-white/5 px-1.5 py-1.5 text-left ring-1 ring-white/10 hover:bg-white/10">
      <div className="grid grid-cols-4 gap-1">
        {ZONES.map((z) => (
          <div key={z.abbr} className="text-center leading-tight">
            <div className="text-[8.5px] font-bold uppercase tracking-wide text-brand-navy-300">{z.flag ?? z.abbr}</div>
            <div className="text-[11px] font-extrabold tabular-nums text-white">{time(z.tz)}</div>
            <div className="truncate text-[7.5px] font-semibold text-brand-navy-300">{z.short}</div>
          </div>
        ))}
      </div>
    </button>
  );
}
