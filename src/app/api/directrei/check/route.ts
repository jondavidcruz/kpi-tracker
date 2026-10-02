import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { directReiConfigured, directReiWhoami } from "@/lib/directrei";

export const dynamic = "force-dynamic";

// Admin-only Direct REI connection test — open while signed in as Jon.
// Hits /me (the key-validation endpoint); never echoes the key itself.
export async function GET() {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return NextResponse.json({ error: "admin only — sign in as Jon" }, { status: 403 });
  if (!directReiConfigured()) {
    return NextResponse.json({ ok: false, hint: "Add DIRECTREI_API_KEY in Vercel → Settings → Environment Variables (create the key in Direct REI → Settings → API & Zapier), then redeploy." });
  }
  const r = await directReiWhoami();
  return NextResponse.json({
    ok: r.ok,
    status: r.status,
    account: r.ok ? r.body : undefined,
    hint: r.ok ? "✅ Connected to Direct REI." : r.status === 401 ? "Key rejected — re-create it in Direct REI → Settings → API & Zapier and paste the full drei_… value." : "Connected but the /me call failed — see status.",
    error: r.ok ? undefined : r.body,
  });
}
