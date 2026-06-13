// AI Updates feed. Secured by CRON_SECRET (Bearer or ?secret=).
//   GET  → list existing suggestions (so an agent can avoid duplicates)
//   POST → add a suggestion { title, rationale?, category?, impact?, effort? }
// Write is intentionally limited to creating *proposals*; it can't accept,
// apply, or change anything — Jon/Marie decide on the AI Updates tab.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function authorized(request: Request, url: URL): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!authorized(request, url)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const suggestions = await db.suggestion.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: { id: true, title: true, category: true, impact: true, effort: true, status: true, createdAt: true },
  });
  return NextResponse.json({ ok: true, count: suggestions.length, suggestions });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!authorized(request, url)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* allow query fallback */ }

  const title = String(body.title ?? url.searchParams.get("title") ?? "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  // Skip if an open proposal with the same title already exists (idempotent agent runs).
  const dupe = await db.suggestion.findFirst({ where: { title, status: "proposed" } });
  if (dupe) return NextResponse.json({ ok: true, skipped: "duplicate", id: dupe.id });

  const s = await db.suggestion.create({
    data: {
      title,
      rationale: String(body.rationale ?? "").trim(),
      category: String(body.category ?? "").trim(),
      impact: String(body.impact ?? "med").trim(),
      effort: String(body.effort ?? "M").trim(),
      status: "proposed",
    },
  });
  return NextResponse.json({ ok: true, id: s.id });
}
