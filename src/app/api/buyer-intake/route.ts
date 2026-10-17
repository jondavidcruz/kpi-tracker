import { NextResponse } from "next/server";
import { createBuyer } from "@/lib/buyers/write";

// 🌐 Public buyer-list opt-in (Jon 2026-10-16 overnight): the freedom-offers.com
// /land-for-sale "VIP buyers list" form POSTs here → the buyer lands in Vetted
// Buyers (to_vet, land-flagged) so dispo can match + pitch them. FREE inbound,
// compounding. No outreach is sent — it only captures the self-identified buyer.
// Public (added to PUBLIC_PATHS); CORS-open so the PostKing page can POST.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch {
    // also accept urlencoded form posts
    try { const fd = await req.formData(); b = Object.fromEntries(fd.entries()); } catch { /* none */ }
  }
  const s = (k: string) => String(b[k] ?? "").trim();
  const name = s("name") || `${s("firstName")} ${s("lastName")}`.trim();
  const email = s("email");
  const phone = s("phone");
  if (!name && !email && !phone) {
    return NextResponse.json({ ok: false, error: "name, email or phone required" }, { status: 400, headers: CORS });
  }
  // states: accept "states" (array or comma list) or single "state"
  const rawStates = Array.isArray(b.states) ? (b.states as string[]) : (s("states") || s("state")).split(/[,;]+/);
  const states = [...new Set(rawStates.map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)))];
  const buyBox = [s("budget") && `Budget: ${s("budget")}`, s("acreage") && `Acreage: ${s("acreage")}`, s("counties") && `Counties: ${s("counties")}`].filter(Boolean).join(" · ");
  try {
    const res = await createBuyer({
      name: name || email || phone,
      company: s("company"),
      email, phone,
      region: states.join(", "), market: s("counties") || states.join(", "),
      buyBox,
      status: "VIP inbound (website)", vetStage: "to_vet", type: "buyer",
      notes: `Joined the land buyers list on freedom-offers.com.${s("notes") ? ` Note: ${s("notes")}` : ""}`,
      source: "freedom-offers.com /land-for-sale",
    }, "web-intake", { isLand: true, targetStates: states });
    return NextResponse.json({ ok: true, added: res.created, duplicate: res.dup }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500, headers: CORS });
  }
}
