// Read-only ticket queue for the scheduled diagnosis agent.
//
// Auth: shared secret via `Authorization: Bearer <CRON_SECRET>` or `?secret=`.
// This endpoint ONLY reads. It returns the tickets a manager has already
// approved (status approved / in_progress) — the "diagnose queue". It cannot
// change anything, and it never exposes tickets still awaiting approval, so the
// automation only ever sees work the admin has explicitly green-lit.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function authorized(request: Request, url: URL): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!authorized(request, url)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tickets = await db.ticket.findMany({
    where: { status: { in: ["approved", "in_progress"] } },
    orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      body: true,
      area: true,
      severity: true,
      status: true,
      submittedBy: true,
      adminNote: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, count: tickets.length, tickets });
}
