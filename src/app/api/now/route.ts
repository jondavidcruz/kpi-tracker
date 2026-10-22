import { NextResponse } from "next/server";

// 🕐 Trusted server time (Jon 2026-10-24). A rep whose computer clock is wrong
// (Michelle's showed 5am at a real 8:45am) gets calls falsely blocked by the
// quiet-hours guard, which reads the device clock. The dialer fetches this to
// detect the skew, correct the quiet-hours check, and warn the rep to fix it.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ now: Date.now() }, { headers: { "cache-control": "no-store" } });
}
