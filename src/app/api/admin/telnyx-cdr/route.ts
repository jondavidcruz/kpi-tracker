import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 🔎 Admin-only Telnyx CDR inspector (Jon 2026-11-19): sanity-check the Apps Script
// "End-of-day Telnyx report" call-cost field against real Telnyx detail_records.
// The Apps Script queries filter[record_type]=call-control (HYPHEN); the valid Telnyx
// value is call_control (UNDERSCORE). This pulls both spellings + messaging over the last
// 7 days and shows each record's cost-bearing fields so we can see where the real $ lives.
// Reads process.env.TELNYX_API_KEY (Vercel) — the key never leaves the server.

type Rec = Record<string, unknown>;

async function pull(key: string, recordType: string, dateField: string, start: string, end: string) {
  const qs =
    `filter[record_type]=${encodeURIComponent(recordType)}` +
    `&filter[${dateField}][gte]=${encodeURIComponent(start)}` +
    `&filter[${dateField}][lt]=${encodeURIComponent(end)}` +
    `&page[size]=3&page[number]=1`;
  const r = await fetch(`https://api.telnyx.com/v2/detail_records?${qs}`, {
    headers: { Authorization: `Bearer ${key}` },
  }).catch((e) => ({ ok: false, status: 0, json: async () => ({ fetchError: String(e) }) } as unknown as Response));
  const status = (r as Response).status;
  let body: { data?: Rec[]; meta?: { total_results?: number; total_pages?: number }; errors?: unknown } = {};
  try { body = await (r as Response).json(); } catch { /* non-json */ }
  const data = Array.isArray(body.data) ? body.data : [];
  const first = data[0] ?? null;
  const costish = first
    ? Object.fromEntries(Object.entries(first).filter(([k]) => /cost|rate|price|amount|fee|charge|billed/i.test(k)))
    : {};
  return {
    status,
    totalResults: body.meta?.total_results ?? null,
    totalPages: body.meta?.total_pages ?? null,
    returned: data.length,
    allKeysOfFirst: first ? Object.keys(first).sort() : [],
    costBearingFields: costish,
    firstRecord: first,
    errors: body.errors ?? null,
  };
}

// Aggregate every page of a record type, summing cost + classifying call legs.
async function aggregate(key: string, recordType: string, dateField: string, start: string, end: string, maxPages = 12) {
  let page = 1, legs = 0, connected = 0, withCostGt0 = 0, sumCost = 0, sumRate = 0, billedSec = 0;
  let apiError: unknown = null, stoppedEarly = false;
  const top: Array<{ cost: string; billed_sec: unknown; call_sec?: unknown; direction: unknown; connection_name?: unknown; started_at?: unknown }> = [];
  while (page <= maxPages) {
    const qs =
      `filter[record_type]=${encodeURIComponent(recordType)}` +
      `&filter[${dateField}][gte]=${encodeURIComponent(start)}&filter[${dateField}][lt]=${encodeURIComponent(end)}` +
      `&page[size]=50&page[number]=${page}`;
    const r = await fetch(`https://api.telnyx.com/v2/detail_records?${qs}`, { headers: { Authorization: `Bearer ${key}` } });
    const body = (await r.json().catch(() => ({}))) as { data?: Rec[]; meta?: { total_pages?: number }; errors?: unknown };
    if (r.status !== 200) { apiError = { status: r.status, errors: body.errors }; break; }
    const data = body.data ?? [];
    for (const d of data) {
      legs++;
      const cost = Math.abs(parseFloat(String(d.cost ?? "0"))) || 0;
      sumCost += cost;
      sumRate += Math.abs(parseFloat(String(d.rate ?? "0"))) || 0;
      billedSec += Number(d.billed_sec ?? 0) || 0;
      if (d.completed === 1 || d.connected === 1 || Number(d.billed_sec ?? 0) > 0) connected++;
      if (cost > 0) {
        withCostGt0++;
        if (top.length < 5) top.push({ cost: String(d.cost), billed_sec: d.billed_sec, call_sec: d.call_sec, direction: d.direction, connection_name: d.connection_name, started_at: d.started_at });
      }
    }
    const totalPages = body.meta?.total_pages ?? 1;
    if (page >= totalPages || data.length === 0) break;
    if (page >= maxPages) { stoppedEarly = true; break; }
    page++;
  }
  return { recordType, legs, connected, withCostGt0, sumCost: Number(sumCost.toFixed(4)), sumRate: Number(sumRate.toFixed(4)), billedSec, pagesScanned: page, partialScan: stoppedEarly, apiError, sampleCostlyLegs: top };
}

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return NextResponse.json({ error: "admin only — sign in as Jon" }, { status: 403 });
  const key = process.env.TELNYX_API_KEY;
  if (!key) return NextResponse.json({ error: "TELNYX_API_KEY not set" }, { status: 500 });

  const sp = new URL(req.url).searchParams;
  const days = Math.min(Number(sp.get("days") ?? 7) || 7, 60);
  const end = new Date().toISOString();
  const start = new Date(Date.now() - days * 86400000).toISOString();

  // 🔎 Voice-usage audit across EVERY Telnyx voice record type (Jon 2026-11-19: "Marie only
  // dials on Telnyx via Direct REI + War Room — double-check the billing usage for today").
  // Direct REI calls may land under a different record_type than the War Room's call-control.
  // Counts per type via meta.total_results (cheap) for TODAY (Pacific) and a 48h safety window.
  if (sp.get("voice") === "1") {
    const tz = "America/Los_Angeles";
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const todayStart = new Date(`${ymd}T00:00:00-08:00`).toISOString();
    const now = new Date().toISOString();
    const w48 = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const candidateTypes = ["call-control", "call_control", "sip-trunking", "sip_trunking", "siptrunking", "siprec", "conference", "conference-participant", "verify", "webrtc", "media-streaming", "tts", "stt", "fax"];
    const countType = async (rt: string, s: string, e: string): Promise<{ status: number; total: number | null }> => {
      const qs = `filter[record_type]=${encodeURIComponent(rt)}&filter[started_at][gte]=${encodeURIComponent(s)}&filter[started_at][lt]=${encodeURIComponent(e)}&page[size]=1&page[number]=1`;
      try {
        const r = await fetch(`https://api.telnyx.com/v2/detail_records?${qs}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
        const b = (await r.json().catch(() => ({}))) as { meta?: { total_results?: number } };
        return { status: r.status, total: r.status === 200 ? (b.meta?.total_results ?? 0) : null };
      } catch { return { status: 0, total: null }; }
    };
    const rows: Array<{ record_type: string; status: number; today: number | null; last48h: number | null }> = [];
    for (const rt of candidateTypes) {
      const [t, w] = await Promise.all([countType(rt, todayStart, now), countType(rt, w48, now)]);
      rows.push({ record_type: rt, status: t.status, today: t.total, last48h: w.total });
    }
    const valid = rows.filter((r) => r.status === 200);
    const todayVoiceTotal = valid.reduce((a, r) => a + (r.today ?? 0), 0);
    const callAgg = await aggregate(key, "call-control", "started_at", todayStart, now);
    return NextResponse.json({
      ok: true,
      note: "Which Telnyx voice record types exist (status 200) and how many legs TODAY (Pacific) vs last 48h. If Direct REI calls aren't in call-control, they show under another 200 type here.",
      windowToday: { todayStart, now, tz },
      validTypes: valid,
      allTypesProbed: rows,
      todayVoiceTotalAcrossAllTypes: todayVoiceTotal,
      callControlTodayDetail: { legs: callAgg.legs, connected: callAgg.connected, billedSec: callAgg.billedSec, cost: callAgg.sumCost },
    });
  }

  if (sp.get("rt")) {
    const one = await pull(key, sp.get("rt")!, sp.get("df") || "started_at", start, end);
    return NextResponse.json({ ok: true, record_type: sp.get("rt"), window: { start, end, days }, ...one });
  }

  if (sp.get("sample") === "1") {
    const [callUnderscore, callHyphen, messaging] = await Promise.all([
      pull(key, "call_control", "started_at", start, end),
      pull(key, "call-control", "started_at", start, end),
      pull(key, "messaging", "created_at", start, end),
    ]);
    return NextResponse.json({ ok: true, window: { start, end, days }, call_control_UNDERSCORE: callUnderscore, "call-control_HYPHEN": callHyphen, messaging });
  }

  const [calls, sms] = await Promise.all([
    aggregate(key, "call-control", "started_at", start, end),
    aggregate(key, "messaging", "created_at", start, end),
  ]);

  return NextResponse.json({
    ok: true,
    window: { start, end, days },
    calls: {
      ...calls,
      verdict: calls.withCostGt0 === 0
        ? "⚠️ ZERO call legs have cost>0 — call spend is NOT in these CDRs (or not rated yet). Call $ can't be read from call-control.cost."
        : `✅ ${calls.withCostGt0}/${calls.legs} call legs carry real cost; total $${calls.sumCost.toFixed(2)} over ${days}d. The field works — most legs are unconnected attempts ($0).`,
    },
    sms: { ...sms, verdict: `SMS: $${sms.sumCost.toFixed(2)} over ${days}d across ${sms.legs} messages (cost field is populated).` },
    note: "Add ?sample=1 for raw first-record field dumps. callCount in the report = call LEGS (incl. unconnected attempts + both directions), not connected conversations.",
  });
}
