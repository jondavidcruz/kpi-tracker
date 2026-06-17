import { NextResponse } from "next/server";
import { runScheduledChecks, sendShiftStartSpeedReminders } from "@/lib/alerts";
import { sendEthanReminder } from "@/lib/ethan-reminder";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";

// Current America/Los_Angeles local hour (0–23) and weekday (0=Sun…6=Sat).
function laHourAndDow(): { hour: number; dow: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 1;
  return { hour, dow };
}

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

  // Start-of-shift run: email scheduled reps whose shift starts this hour (LA time)
  // and who haven't run today's speed test. Cron fires at the candidate UTC hours
  // for both PST/PDT; only the firing matching a rep's local start hour sends.
  // Manual test: pass &lahour=9&ladow=1 to simulate a specific shift start.
  if (url.searchParams.get("speedtest") === "1") {
    const settings = await getSettings();
    const la = laHourAndDow();
    const hour = url.searchParams.has("lahour") ? Number(url.searchParams.get("lahour")) : la.hour;
    const dow = url.searchParams.has("ladow") ? Number(url.searchParams.get("ladow")) : la.dow;
    const reminded = await sendShiftStartSpeedReminders(date ?? todayStr(settings.orgTimezone), hour, dow);
    return NextResponse.json({ ok: true, laHour: hour, laDow: dow, speedTestReminded: reminded });
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
