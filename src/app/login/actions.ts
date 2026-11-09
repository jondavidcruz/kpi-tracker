"use server";

// Roster-gated magic-link sender. The login page calls THIS (a server action)
// instead of calling Supabase's signInWithOtp directly from the browser, so that:
//   • a one-tap sign-in link is only ever sent to an email that is already an
//     ACTIVE roster member (no emails to strangers, no junk auth rows created),
//   • the response is identical whether or not the email is on the roster, so the
//     page can't be used to probe who has access (no email enumeration).
// Password + Google sign-in stay client-side: a bad password just fails (creates
// nothing), and Google sign-ins by non-members are bounced at the app shell.
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";

export async function requestMagicLink(rawEmail: string, rawNext: string): Promise<{ ok: true }> {
  const email = (rawEmail || "").trim().toLowerCase();
  try {
    if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      const user = await db.user.findUnique({ where: { email }, select: { active: true } });
      // ONLY send to an active roster member. Everyone else: silently do nothing.
      if (user?.active) {
        const h = await headers();
        const host = h.get("x-forwarded-host") ?? h.get("host") ?? "kpi-tracker-lovat.vercel.app";
        const proto = h.get("x-forwarded-proto") ?? "https";
        const origin = `${proto}://${host}`;
        const next = rawNext && rawNext.startsWith("/") ? rawNext : "/dashboard";
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
      }
    }
  } catch {
    // Swallow everything — never leak whether the email exists or why a send failed.
  }
  // Always the same answer, so the page reveals nothing about who has access.
  return { ok: true };
}
