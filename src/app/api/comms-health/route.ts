import { NextResponse } from "next/server";
import { checkAndRecordComms } from "@/lib/comms-health";

export const dynamic = "force-dynamic";

// 🛡️ Comms Guardian endpoint. Read-only + self-throttled (re-runs the live battery
// at most once a minute), returns NO secrets — just lane status. Returns HTTP 200
// when every lane is healthy and 503 when any lane is down, so an external uptime
// monitor (UptimeRobot / Better Uptime) can watch it for true 24/7 coverage, and the
// scheduled Comms Guardian task curls it to verify + alert. `?force=1` bypasses the
// 1-minute cache for an on-demand check.
export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    const snap = await checkAndRecordComms(force);
    const down = snap.lanes.filter((l) => !l.ok).map((l) => ({ lane: l.label, detail: l.detail, fix: l.fix }));
    return NextResponse.json(
      { ok: snap.ok, at: snap.at, down, lanes: snap.lanes.map((l) => ({ key: l.key, label: l.label, ok: l.ok, detail: l.detail, fix: l.fix })) },
      { status: snap.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
