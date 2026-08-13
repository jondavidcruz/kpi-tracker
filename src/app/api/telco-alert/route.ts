import { NextResponse } from "next/server";
import { normalizeIncoming, pushTelcoAlerts } from "@/lib/telco-alerts";
import { humanizeAlarm } from "@/lib/telco-errors";
import { db } from "@/lib/db";
import { postChatWebhook } from "@/lib/notify";

export const dynamic = "force-dynamic";

// Public webhook — Twilio (Debugger) and Telnyx (notifications) POST alarms here.
// Point Twilio: Console → Monitor → Debugger → Webhook → https://<app>/api/telco-alert?provider=twilio
// Point Telnyx: any messaging/number webhook → https://<app>/api/telco-alert?provider=telnyx
// Stores the alarm in the war room and posts it to the phone-health Chat.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") ?? "twilio";
  const now = new Date().toISOString();

  // Accept JSON or form-encoded (Twilio Debugger posts form fields).
  let body: Record<string, unknown> = {};
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      body = (await request.json()) as Record<string, unknown>;
    } else {
      const form = await request.formData();
      body = Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
    }
  } catch { /* tolerate empty/odd bodies */ }

  const alerts = normalizeIncoming(provider, body, now);
  if (alerts.length === 0) return NextResponse.json({ ok: true, stored: 0 });

  await pushTelcoAlerts(alerts);

  // Fan out to the phone-health Chat space so the team sees it immediately.
  try {
    const cfg = await db.resource.findFirst({ where: { category: "__phone_config__" } });
    if (cfg?.url) {
      const lines = alerts.map((a) => { const h = humanizeAlarm(a.code, a.text); return `${a.level === "error" ? "🔴" : "⚠️"} *${a.provider}*${a.code ? ` [${a.code}]` : ""}: ${h.meaning}${h.action ? ` — ${h.action}` : ""}`; });
      await postChatWebhook(cfg.url, `🚨 *Line alarm*\n${lines.join("\n")}`);
    }
  } catch { /* chat is best-effort */ }

  return NextResponse.json({ ok: true, stored: alerts.length });
}
