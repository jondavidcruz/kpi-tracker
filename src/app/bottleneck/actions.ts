"use server";
import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { sendBottleneckReport } from "@/lib/bottleneck";

/** Owner-only: build + deliver the bottleneck report now (leadership-ops chat + email),
 *  so Jon can fire it on demand instead of waiting for the Friday cron. */
export async function sendBottleneckNow(): Promise<void> {
  const me = await getCurrentUser();
  if (!isOwner(me)) redirect("/bottleneck?sent=denied");
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const r = await sendBottleneckReport(today).catch(() => ({ posted: false, emailed: false }));
  redirect(`/bottleneck?sent=1&chat=${r.posted ? 1 : 0}&mail=${r.emailed ? 1 : 0}`);
}
