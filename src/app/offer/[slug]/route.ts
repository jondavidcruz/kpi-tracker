import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 🔗 /offer/<address> short-link redirect + click tracking (Jon 2026-10-20: make the
// shortened link read "offer/<the property address>"). Resolves the slug via the
// shared shortlinks store, logs a click to the lead's timeline, and 302s to the real
// URL. Public — sellers open it from a text. (Coexists with /offer, the intake form.)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { resolveAndTrack } = await import("@/lib/shortlinks");
  const l = await resolveAndTrack(String(slug || "")).catch(() => null);
  if (!l) return NextResponse.redirect("https://freedom-offers.com", 302);
  if (l.contactId) {
    try {
      const { logCrmEvent } = await import("@/lib/crm");
      await logCrmEvent({ contactId: l.contactId, oppId: l.oppId || "", kind: "system", body: `🔗 Seller opened the link we texted${l.clicks > 1 ? ` (${l.clicks}× now)` : ""} — ${l.url.slice(0, 70)}`, actor: "link-track" });
    } catch { /* tracking is best-effort — never block the redirect */ }
  }
  const dest = /^https?:\/\//i.test(l.url) ? l.url : `https://${l.url}`;
  return NextResponse.redirect(dest, 302);
}
