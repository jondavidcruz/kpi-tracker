"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Always-on War Room status light (owner only) — green = all good, amber = maintenance,
// red = major issue. Polls /api/health; click to open the full System Health page.
const COLOR: Record<string, string> = { green: "bg-emerald-400", yellow: "bg-amber-400", red: "bg-red-500" };
const TITLE: Record<string, string> = { green: "All systems good", yellow: "Maintenance required — click for details", red: "Major issue — click for details" };

export default function StatusDot() {
  const [overall, setOverall] = useState<string>("");
  const [issues, setIssues] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (!alive) return;
        setOverall(j.overall ?? "");
        setIssues((j.checks ?? []).filter((c: { status: string }) => c.status !== "ok").length);
      } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!overall) return null;
  return (
    <Link href="/system-check" title={TITLE[overall]} className="flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-1 text-[10px] font-semibold text-brand-navy-100 ring-1 ring-white/10 hover:bg-white/10">
      <span className={`h-2 w-2 rounded-full ${COLOR[overall]} ${overall !== "green" ? "animate-pulse" : ""}`} />
      {overall === "green" ? "All systems good" : overall === "yellow" ? `${issues} to review` : "Issue — fix now"}
    </Link>
  );
}
