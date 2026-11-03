import { NextResponse } from "next/server";
import { usageStatus } from "@/lib/usage-watch";

export const dynamic = "force-dynamic";

// 📊 Public status for the Friday Platform Spend & Limits routine (and any uptime monitor).
// Returns only non-sensitive status flags — no account numbers, no billing detail. The
// routine alerts when level === "act" (near a limit) or the reading is stale.
export async function GET() {
  try {
    const s = await usageStatus();
    const alert = s.level === "act" || (s.stale && s.recordedAt !== null) || s.level === "none";
    return NextResponse.json({
      recordedAt: s.recordedAt,
      stale: s.stale,
      level: s.level,              // "ok" | "warn" | "act" | "none"
      worstPct: s.worstPct,
      flagged: s.flagged,          // [{ label, pct, level }]
      alert,                       // true if the routine should ping Jon
    }, { status: alert ? 503 : 200 });
  } catch {
    return NextResponse.json({ error: "usage-watch unavailable" }, { status: 500 });
  }
}
