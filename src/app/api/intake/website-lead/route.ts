import { NextResponse } from "next/server";
import { parseWebsiteLead, createWebsiteLead } from "@/lib/website-lead";

export const dynamic = "force-dynamic";

// Public intake for the freedom-offers.com private-offer form. Accepts JSON or
// form posts. Honeypot field "company_website" silently drops bots.
const ALLOWED_ORIGINS = ["https://freedom-offers.com", "https://www.freedom-offers.com"];

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: Request) {
  const headers = corsHeaders(req);
  let raw: Record<string, unknown> = {};
  try {
    const ct = req.headers.get("content-type") ?? "";
    raw = ct.includes("application/json") ? await req.json() : Object.fromEntries((await req.formData()).entries());
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read the form. Please try again." }, { status: 400, headers });
  }

  const parsed = parseWebsiteLead(raw, {
    ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim(),
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    sourcePage: (req.headers.get("referer") ?? "").slice(0, 300),
  });
  if (!parsed.ok) {
    if (parsed.bot) return NextResponse.json({ ok: true }, { headers });
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400, headers });
  }

  try {
    const { oppId } = await createWebsiteLead(parsed.lead);
    return NextResponse.json({ ok: true, id: oppId }, { headers });
  } catch (e) {
    console.error("website-lead intake failed", e);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please call 1-877-652-8991." },
      { status: 500, headers },
    );
  }
}
