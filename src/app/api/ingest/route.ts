// Webhook ingest: external services (iSpeedToLead, REIReply/GHL) POST here to
// auto-increment a team daily KPI count — no scraping, no manual entry.
//
// Auth: shared secret via `Authorization: Bearer <INGEST_SECRET>` header, or
// `?secret=<INGEST_SECRET>` query param (some webhook UIs only allow query).
//
// Body (JSON): { "kpi": "ppl_leads", "count": 1, "date": "YYYY-MM-DD" }
//   - kpi    (required) the KPI key, e.g. "ppl_leads" or "text_responses"
//   - count  (optional) how much to add; defaults to 1
//   - date   (optional) override day; defaults to today in org timezone
//
// Only team-scope daily KPIs may be incremented (safety allow-list below).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";

export const dynamic = "force-dynamic";

// Only these team daily counters can be driven by webhooks.
const ALLOWED = new Set(["ppl_leads", "text_responses", "direct_mail_responses"]);

function authorized(request: Request, url: URL): boolean {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return false; // refuse if unconfigured — fail closed
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!authorized(request, url)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Accept body from JSON; fall back to query params for simple webhook UIs.
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // no/invalid JSON body — use query params
  }

  const kpiKey = String(body.kpi ?? url.searchParams.get("kpi") ?? "").trim();
  const rawCount = body.count ?? url.searchParams.get("count") ?? 1;
  const count = Number(rawCount);

  if (!ALLOWED.has(kpiKey)) {
    return NextResponse.json(
      { error: `kpi must be one of: ${[...ALLOWED].join(", ")}` },
      { status: 400 },
    );
  }
  if (!Number.isFinite(count) || count <= 0) {
    return NextResponse.json({ error: "count must be a positive number" }, { status: 400 });
  }

  const kpi = await db.kpi.findUnique({ where: { key: kpiKey } });
  if (!kpi) {
    return NextResponse.json({ error: `KPI '${kpiKey}' not found` }, { status: 404 });
  }

  const settings = await getSettings();
  const date =
    String(body.date ?? url.searchParams.get("date") ?? "").trim() ||
    todayStr(settings.orgTimezone);

  // Atomic upsert-increment of the team daily entry (userId null).
  const existing = await db.entry.findFirst({
    where: { kpiId: kpi.id, userId: null, date },
  });
  let total: number;
  if (existing) {
    const updated = await db.entry.update({
      where: { id: existing.id },
      data: { value: { increment: count }, enteredBy: "webhook" },
    });
    total = updated.value;
  } else {
    const created = await db.entry.create({
      data: { kpiId: kpi.id, userId: null, date, value: count, enteredBy: "webhook" },
    });
    total = created.value;
  }

  return NextResponse.json({ ok: true, kpi: kpiKey, date, added: count, total });
}

// Lightweight health check (no secret needed) so you can confirm the route is live.
export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST { kpi, count?, date? } with Authorization: Bearer <INGEST_SECRET>",
    allowed: [...ALLOWED],
  });
}
