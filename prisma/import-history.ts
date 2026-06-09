// One-off: import historical daily KPI data from the old scorecard xlsx into
// dated Entry rows. Clean mappings only; attributes data to whoever did the work
// (incl. role-changed Michelle/Jon). Idempotent: upserts by (kpi,user,date).
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const db = new PrismaClient();

// The parsed rows are produced by the Python extractor and written to
// /tmp/hist-rows.json as: [{ person, kpiKey, unit, points: [[ "YYYY-MM-DD", value ], ...] }]
interface Series { person: string; kpiKey: string; unit: string; points: [string, number][]; }

async function main() {
  const raw = readFileSync("/tmp/hist-rows.json", "utf8");
  const series: Series[] = JSON.parse(raw);

  // name(first) -> user id
  const users = await db.user.findMany();
  const byFirst = new Map(users.map((u) => [u.name.split(" ")[0].toLowerCase(), u.id]));
  const kpis = await db.kpi.findMany();
  const kpiByKey = new Map(kpis.map((k) => [k.key, k]));

  let created = 0, updated = 0, skipped = 0;
  for (const s of series) {
    const userId = byFirst.get(s.person.toLowerCase());
    const kpi = kpiByKey.get(s.kpiKey);
    if (!userId || !kpi) { skipped += s.points.length; continue; }
    for (const [date, value] of s.points) {
      // duration historically stored 0s in sheet; skip zero-only duration noise
      const existing = await db.entry.findFirst({ where: { kpiId: kpi.id, userId, date } });
      if (existing) {
        await db.entry.update({ where: { id: existing.id }, data: { value, enteredBy: "import" } });
        updated++;
      } else {
        await db.entry.create({ data: { kpiId: kpi.id, userId, date, value, enteredBy: "import" } });
        created++;
      }
    }
  }
  console.log(`history import: created=${created} updated=${updated} skipped=${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
