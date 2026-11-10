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
    select: { body: true, meta: true },
  });
  const isDial = (b: string) => b.startsWith("Browser call") || b.startsWith("Telnyx call ended") || b.startsWith("Click-to-call");
  const dials = events.filter((e) => isDial(e.body)).length;
  const connects = events.filter((e) => /^Dialer disposition: (talked|appointment requested|callback requested)/.test(e.body)).length;
  // ⏱ total talk time today (Jon 2026-10-13: "not tracking the total talk time")
  const talkSecs = events.reduce((sum, e) => { const s = Number((e.meta as { secs?: number } | null)?.secs ?? 0); return sum + (isDial(e.body) ? s : 0); }, 0);
  // goals from the same Target overrides the KPI scoreboard uses
  const goal = async (key: string) => {
    const kpi = await db.kpi.findFirst({ where: { OR: [{ key }, { name: { equals: key, mode: "insensitive" } }] }, select: { id: true } });
    if (!kpi) return 0;
    const t = await db.target.findFirst({ where: { kpiId: kpi.id, userId: me!.id, period: null }, select: { goalValue: true } });
    return t?.goalValue ?? 0;
  };
  const [goalDials, goalConnects] = await Promise.all([goal("outbound_calls"), goal("connected_calls")]);
  // 🎯 Role core levers under the pill (Jon 2026-11-09): the 3 money levers we push on.
  // Acquisitions = offers / contracts sent / signed; Dispositions = buy-boxes / deals sent
  // to buyers / buyer offers in. Today's recorded KPI values for this rep.
  const LEVERS: Record<string, { label: string; keys: string[] }[]> = {
    acquisitions: [
      { label: "offers", keys: ["offers_made"] },
      { label: "sent", keys: ["acq_contracts_sent"] },
      { label: "signed", keys: ["acq_signed_assignment", "acq_signed_novation", "acq_signed_creative"] },
    ],
    dispositions: [
      { label: "buy-boxes", keys: ["buy_boxes_captured"] },
      { label: "sent", keys: ["deals_sold"] },
      { label: "offers in", keys: ["buyer_offers_received"] },
    ],
  };
  const leverValue = async (keys: string[]): Promise<number> => {
    let total = 0;
    for (const key of keys) {
      const kpi = await db.kpi.findFirst({ where: { key }, select: { id: true } });
      if (!kpi) continue;
      const e = await db.entry.findFirst({ where: { kpiId: kpi.id, userId: me!.id, date: ptYmd }, select: { value: true } });
      total += e?.value ?? 0;
    }
    return total;
  };
  const roleLevers = LEVERS[me!.position ?? ""] ?? [];
  const levers = await Promise.all(roleLevers.map(async (l) => ({ label: l.label, value: await leverValue(l.keys) })));
  return NextResponse.json({ who: me!.name.split(" ")[0], position: me!.position ?? "", dials, connects, talkSecs, goalDials, goalConnects, levers }, { headers: { "Cache-Control": "private, no-store" } });
}
