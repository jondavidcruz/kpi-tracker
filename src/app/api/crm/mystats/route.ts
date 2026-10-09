import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 📊 My-day scoreboard (Jon 2026-10-09): live dials + connects for the pill
// every rep sees all day. Dials = real call legs logged today; connects =
// dispositions where a human actually picked up (talked/appt/callback).
export async function GET() {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ error: "no access" }, { status: 403 });
  // "today" in the org's day (PT) — matches how the KPI scoreboard counts
  const now = new Date();
  const ptYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
  const start = new Date(`${ptYmd}T00:00:00-07:00`);
  const events = await db.crmEvent.findMany({
    where: { kind: "call", actor: me!.name, at: { gte: start } },
    select: { body: true },
  });
  const dials = events.filter((e) => e.body.startsWith("Browser call") || e.body.startsWith("Telnyx call ended")).length;
  const connects = events.filter((e) => /^Dialer disposition: (talked|appointment requested|callback requested)/.test(e.body)).length;
  // goals from the same Target overrides the KPI scoreboard uses
  const goal = async (key: string) => {
    const kpi = await db.kpi.findFirst({ where: { OR: [{ key }, { name: { equals: key, mode: "insensitive" } }] }, select: { id: true } });
    if (!kpi) return 0;
    const t = await db.target.findFirst({ where: { kpiId: kpi.id, userId: me!.id, period: null }, select: { goalValue: true } });
    return t?.goalValue ?? 0;
  };
  const [goalDials, goalConnects] = await Promise.all([goal("outbound_calls"), goal("connected_calls")]);
  return NextResponse.json({ dials, connects, goalDials, goalConnects });
}
