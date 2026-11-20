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

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return NextResponse.json({ error: "admin only — sign in as Jon" }, { status: 403 });
  const key = process.env.TELNYX_API_KEY;
  if (!key) return NextResponse.json({ error: "TELNYX_API_KEY not set" }, { status: 500 });

  const days = Math.min(Number(new URL(req.url).searchParams.get("days") ?? 7) || 7, 60);
  const end = new Date().toISOString();
  const start = new Date(Date.now() - days * 86400000).toISOString();

  const [callUnderscore, callHyphen, messaging] = await Promise.all([
    pull(key, "call_control", "started_at", start, end), // the CORRECT Telnyx spelling
    pull(key, "call-control", "started_at", start, end), // what the Apps Script currently uses
    pull(key, "messaging", "created_at", start, end),    // texts (known-good, for contrast)
  ]);

  return NextResponse.json({
    ok: true,
    window: { start, end, days },
    note: "Compare call_control (underscore) vs call-control (hyphen). Whichever returns real totalResults + a populated cost field is the right one for the Apps Script.",
    call_control_UNDERSCORE: callUnderscore,
    "call-control_HYPHEN": callHyphen,
    messaging,
  });
}
