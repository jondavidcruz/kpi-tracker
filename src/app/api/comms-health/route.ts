import { NextResponse } from "next/server";
import { checkAndRecordComms } from "@/lib/comms-health";
import { partitionNumbers } from "@/lib/telnyx-numbers";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Safe diagnostic (masked numbers only): which Telnyx connection each live line is on,
// and whether any live line is wired to the War Room browser-dialer connection — the
// real reason a call can "connect but drop" is the caller ID not being on that line.
async function diag() {
  const { live, porting, unknownToApi } = await partitionNumbers();
  let warRoomConn = "";
  try {
    const row = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } });
    const cfg = (row?.description ? JSON.parse(row.description) : {}) as { connId?: string; callerId?: string };
    warRoomConn = cfg.callerId ? `caller:${cfg.callerId.slice(-4)}` : "";
  } catch { /* ignore */ }
  const mask = (n: { number: string; connection: string; msgProfile: boolean; status: string }) => ({ last4: n.number.slice(-4), connection: n.connection, sms: n.msgProfile, status: n.status });
  const warRoomLive = live.filter((n) => /war room/i.test(n.connection));
  return {
    warRoomConn,
    liveTotal: live.length,
    warRoomLiveCount: warRoomLive.length,
    connections: [...new Set(live.map((n) => n.connection))],
    live: live.map(mask),
    porting: porting.map(mask),
    portingNotYetOnApi: unknownToApi,
  };
}

// 🛡️ Comms Guardian endpoint. Read-only + self-throttled (re-runs the live battery
// at most once a minute), returns NO secrets — just lane status. Returns HTTP 200
// when every lane is healthy and 503 when any lane is down, so an external uptime
// monitor (UptimeRobot / Better Uptime) can watch it for true 24/7 coverage, and the
// scheduled Comms Guardian task curls it to verify + alert. `?force=1` bypasses the
// 1-minute cache for an on-demand check.
// 🔀 Inbound-routing diagnostic (Jon 2026-10-21: "Marie answered but it connected to
// Michelle's line"). Shows whether each rep has a DISTINCT SIP identity + fresh
// presence, and the last ring events (which sipUser actually answered). Masked.
async function routingDiag() {
  const maskSip = (s?: string) => (s ? `${s.slice(0, 5)}…${s.slice(-4)} (${s.length})` : "");
  const maskTo = (s?: string) => (s || "").replace(/^sip:/, "").split("@")[0].replace(/^(.{5}).*(.{4})$/, "$1…$2");
  let agents: Record<string, { sipUser?: string; lastSeen?: string; onCall?: boolean }> = {};
  let sharedSip = "";
  try {
    const row = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } });
    const cfg = (row?.description ? JSON.parse(row.description) : {}) as { sipUser?: string; agents?: typeof agents };
    agents = cfg.agents ?? {};
    sharedSip = cfg.sipUser ?? "";
  } catch { /* ignore */ }
  const now = Date.now();
  const sipVals = Object.values(agents).map((a) => a.sipUser).filter(Boolean) as string[];
  const dupSip = sipVals.length !== new Set(sipVals).size;
  const roster = Object.entries(agents).map(([first, a]) => ({
    rep: first, sip: maskSip(a.sipUser),
    freshMin: a.lastSeen ? Math.round((now - Date.parse(a.lastSeen)) / 60000) : null,
    onCall: !!a.onCall,
  }));
  let events: unknown[] = [];
  try {
    const row = await db.resource.findFirst({ where: { category: "__telnyx_events__" } });
    const list = (row?.description ? JSON.parse(row.description) : []) as Array<Record<string, unknown>>;
    events = list.slice(0, 16).map((e) => ({ at: e.at, ev: e.ev, to: maskTo(e.to as string), answered: e.answered }));
  } catch { /* ignore */ }
  return { sharedSip: maskSip(sharedSip), distinctSipPerRep: !dupSip, agentCount: roster.length, roster, recentEvents: events };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  try {
    if (url.searchParams.get("detail") === "1") {
      return NextResponse.json(await diag(), { headers: { "Cache-Control": "no-store" } });
    }
    if (url.searchParams.get("routing") === "1") {
      return NextResponse.json(await routingDiag(), { headers: { "Cache-Control": "no-store" } });
    }
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
