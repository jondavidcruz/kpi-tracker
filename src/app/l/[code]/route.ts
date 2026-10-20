import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 🔗 Short-link redirect + click tracking. Public (sellers click it from a text).
// Resolves /l/<code> → the real URL, bumps the click count, and logs a click onto
// the lead's timeline so the rep SEES when the seller opened the link.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { resolveAndTrack } = await import("@/lib/shortlinks");
  const l = await resolveAndTrack(String(code || "")).catch(() => null);
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
