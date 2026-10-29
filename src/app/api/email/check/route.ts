// ✉️ Email diagnostic (Jon 2026-10-29: "someone tried to send an email yesterday, it wasn't
// working"). Shows the live Resend config + the most recent FAILED sends with the REAL error
// Resend returned, so we see the actual cause. `?test=1&to=you@email` sends a test (owner only).
// Owner session OR CRON_SECRET. Read part is safe; the test send is owner-gated.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isOwner } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const bySecret = !!secret && (req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("secret") === secret);
  const me = await getCurrentUser().catch(() => null);
  if (!bySecret && !isOwner(me)) return NextResponse.json({ error: "owner only" }, { status: 403 });

  const { getChannelConfig } = await import("@/lib/notify");
  const cfg = await getChannelConfig();
  const config = {
    resendKeySet: Boolean(cfg.resendKey),
    resendKeyPrefix: cfg.resendKey ? cfg.resendKey.slice(0, 5) + "…" : "(missing)",
    emailFrom: cfg.emailFrom || "(missing — set ALERT_EMAIL_FROM or Settings emailFromAddress)",
    alertRecipients: cfg.emailRecipients,
  };

  // The last failed sends carry the real Resend error (logged into the timeline on failure).
  const fails = await db.crmEvent.findMany({
    where: { kind: "email", body: { contains: "SEND FAILED" } },
    orderBy: { at: "desc" }, take: 8,
    select: { at: true, actor: true, body: true, contactId: true },
  }).catch(() => []);
  const recentFailures = fails.map((f) => ({
    at: f.at.toISOString(), by: f.actor, contactId: f.contactId,
    error: (f.body.match(/SEND FAILED(?::\s*)?([^)]*)/i)?.[1] || "").trim().slice(0, 200),
    preview: f.body.slice(0, 120),
  }));

  // Optional live test — owner only, never via the cron secret (it's an outbound send).
  let test: unknown = undefined;
  if (url.searchParams.get("test") === "1") {
    if (!isOwner(me)) test = { error: "test send is owner-session only" };
    else {
      const to = (url.searchParams.get("to") || me?.email || "").trim();
      if (!to) test = { error: "add &to=your@email" };
      else {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${cfg.resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: cfg.emailFrom, to: [to], subject: "War Room email test", html: "<p>If you got this, Resend sending works. ✅</p>" }),
          });
          const t = await res.text();
          test = { to, status: res.status, ok: res.ok, response: t.slice(0, 300) };
        } catch (e) { test = { to, error: String(e).slice(0, 200) }; }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    config,
    hint: !config.resendKeySet ? "RESEND_API_KEY is not set in Vercel — no email can send." : "Key is set. If sends fail, the recentFailures error below is the exact reason (usually a from-domain not verified in Resend, an invalid from/to, or a 403/422).",
    recentFailures,
    test,
  });
}
