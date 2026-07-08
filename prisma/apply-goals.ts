// One-off: apply realistic-but-stretch goals grounded in real sheet output.
// Goals are set slightly above each person's proven non-zero daily average.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function setKpiGoal(key: string, goalKind: string, goalValue: number | null) {
  const k = await db.kpi.findUnique({ where: { key } });
  if (!k) return console.log(`  ! KPI ${key} not found`);
  await db.kpi.update({ where: { id: k.id }, data: { goalKind, goalValue } });
  console.log(`  KPI ${key} -> ${goalKind} ${goalValue}`);
}

// per-rep (or team if userName null) goal override via Target
async function setTarget(key: string, userName: string | null, goalValue: number) {
  const k = await db.kpi.findUnique({ where: { key } });
  if (!k) return console.log(`  ! KPI ${key} not found`);
  let userId: string | null = null;
  if (userName) {
    const u = await db.user.findFirst({ where: { name: userName } });
    if (!u) return console.log(`  ! user ${userName} not found`);
    userId = u.id;
  }
  const existing = await db.target.findFirst({ where: { kpiId: k.id, userId, period: null } });
  if (existing) await db.target.update({ where: { id: existing.id }, data: { goalValue } });
  else await db.target.create({ data: { kpiId: k.id, userId, period: null, goalValue } });
  console.log(`  TARGET ${key} [${userName ?? "team"}] -> ${goalValue}`);
}

async function main() {
  console.log("== Role KPI goal-kinds (base goals = lower-hours person; per-rep targets override) ==");
  // CC/LM (Irish, 25h) — base goals ARE Irish's goals
  await setKpiGoal("outbound_calls", "at_least", 120);
  await setKpiGoal("connected_calls", "at_least", 90);
  await setKpiGoal("quality_convos", "at_least", 10);
  await setKpiGoal("appts_set", "at_least", 3); // was 20; Irish best month avg 2.3 -> 3 is stretch
  // cc_talk_time already 3600 (1:00) — leave

  // Acquisitions — make offers_made a real goal; Michelle target higher
  await setKpiGoal("offers_made", "at_least", 2);
  // appts_taken stays at_least 100
  // acq_talk_time currently 7200 (2:00) -> set base 1:30 = 5400; Michelle target same
  await setKpiGoal("acq_talk_time", "at_least", 5400);

  // Dispositions — set stretch goals on the EXISTING app KPIs (kept per user choice).
  // base goal = Marie (25h); Sharyn (37h) gets a higher per-rep target.
  await setKpiGoal("buyers_contacted", "at_least", 80); // Marie proven 62 -> 80 stretch
  await setKpiGoal("new_buyers", "at_least", 2); // ~ buyers qualified proven 2.4
  await setKpiGoal("deals_sold", "at_least", 2); // ~ deals sent proven; stretch
  // deals_under_contract + avg_days_to_sell stay tracked

  console.log("== Per-rep targets (stretch above proven) ==");
  // Irish base already = her goals; nothing extra needed.
  // Michelle (37h, hybrid acq+LM)
  await setTarget("offers_made", "Michelle", 2);
  await setTarget("acq_talk_time", "Michelle", 5400); // 1:30

  // Sharyn (37h) — proven ~2x Marie
  await setTarget("buyers_contacted", "Sharyn", 140);
  await setTarget("new_buyers", "Sharyn", 3);
  await setTarget("deals_sold", "Sharyn", 4);
  // Marie (25h) — base goals already fit (80/2/2); add explicit for clarity
  await setTarget("buyers_contacted", "Marie", 80);

  console.log("== Team monthly goals ==");
  await setKpiGoal("contracts_sent", "at_least", 20); // was 30
  await setKpiGoal("contracts_signed", "at_least", 6); // was 10

  console.log("Done.");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
