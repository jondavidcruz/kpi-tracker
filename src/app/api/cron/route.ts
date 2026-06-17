import { NextResponse } from "next/server";
import { runScheduledChecks, sendSpeedTestReminderEmail } from "@/lib/alerts";
import { sendEthanReminder } from "@/lib/ethan-reminder";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";

export const dynamic = "force-dynamic";

/**
 * Scheduled alert check. Vercel Cron calls this with
 * `Authorization: Bearer $CRON_SECRET`. For manual runs you can pass
 * `?secret=$CRON_SECRET` and optionally `?date=YYYY-MM-DD&force=1`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const auth = request.headers.get("authorization");
    const fromHeader = auth === `Bearer ${secret}`;
    const fromQuery = url.searchParams.get("secret") === secret;
    if (!fromHeader && !fromQuery) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const date = url.searchParams.get("date") ?? undefined;
  const force = url.searchParams.get("force") === "1";
  const weekly = url.searchParams.get("weekly") === "1";
  const review = url.searchParams.get("review") === "1";

  // Start-of-shift run: email reps who haven't run today's internet speed test.
  if (url.searchParams.get("speedtest") === "1") {
    const settings = await getSettings();
    const reminded = await sendSpeedTestReminderEmail(date ?? todayStr(settings.orgTimezone));
    return NextResponse.json({ ok: true, speedTestReminded: reminded });
  }

  // Lightweight midday run: only Ethan's shift-end KPI reminder (no digest).
  if (url.searchParams.get("ethan") === "1") {
    const settings = await getSettings();
    const ethanReminded = await sendEthanReminder(date ?? todayStr(settings.orgTimezone));
    return NextResponse.json({ ok: true, ethanReminded });
  }

  const result = await runScheduledChecks({ date, force, weekly, review });
  return NextResponse.json({ ok: true, ...result });
}
