import Link from "next/link";
import { db } from "@/lib/db";
import { getSettings, resolveGoalWith, getAllTargets } from "@/lib/data";
import { todayStr, lastWeekRange, datesInRange } from "@/lib/date";
import { formatValue, type Unit } from "@/lib/format";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { positionLabel } from "@/lib/roles";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

// A high-level weekly performance review for one rep — built for keep/reassign
// decisions. Manager/admin only.
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Private</h1>
        <p className="mt-2 text-sm text-slate-500">Performance reviews are owner-only.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }

  const { id } = await params;
  const sp = await searchParams;
  const settings = await getSettings();
  const today = sp.date ?? todayStr(settings.orgTimezone);
  const wk = lastWeekRange(today);
  const workdays = datesInRange(wk.start, wk.end).filter((d) => {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    return dow >= 1 && dow <= 5; // Mon–Fri
  });

  const rep = await db.user.findUnique({ where: { id } });
  if (!rep) return <Card className="p-8 text-center text-slate-500">Rep not found.</Card>;

  const kpis = await db.kpi.findMany({
    where: { active: true, scope: "per_rep", cadence: "daily", computed: false, roleKey: rep.position },
    orderBy: { sortOrder: "asc" },
  });
  const targets = await getAllTargets();

  // Pull this rep's entries for last week.
  const entries = await db.entry.findMany({
    where: { userId: rep.id, date: { gte: wk.start, lte: wk.end } },
  });
  const month = wk.start.slice(0, 7);

  // Per-KPI weekly rollup.
  const rows = kpis.map((k) => {
    const es = entries.filter((e) => e.kpiId === k.id);
    const total = es.reduce((s, e) => s + e.value, 0);
    const daysLogged = new Set(es.map((e) => e.date)).size;
    const avg = daysLogged ? total / daysLogged : 0;
    const goal = resolveGoalWith(targets, k, rep.id, month);
    return { k, total, daysLogged, avg, goal };
  });

  // Reliability: distinct days the rep logged ANYTHING last week vs workdays.
  const daysActive = new Set(entries.map((e) => e.date)).size;
  const reliability = workdays.length ? Math.round((daysActive / workdays.length) * 100) : 0;

  // Appointments-set is the core output for CC/LM; process calls = training metric.
  const appts = rows.find((r) => r.k.key === "appts_set");
  const processTraining = rows.find((r) => /process/i.test(r.k.name));

  // Simple keep/reassign signal.
  const signals: { label: string; tone: "good" | "warn" | "bad" }[] = [];
  if (reliability < 60) signals.push({ label: `Logged only ${daysActive}/${workdays.length} workdays (${reliability}%)`, tone: "bad" });
  else if (reliability < 85) signals.push({ label: `Logged ${daysActive}/${workdays.length} workdays (${reliability}%)`, tone: "warn" });
  else signals.push({ label: `Consistent: ${daysActive}/${workdays.length} workdays`, tone: "good" });

  if (appts) {
    const hit = appts.goal ? appts.avg >= appts.goal : null;
    if (hit === false) signals.push({ label: `Appointments below goal (${appts.avg.toFixed(1)}/day vs ${appts.goal})`, tone: "bad" });
    else if (hit) signals.push({ label: `Appointments at goal (${appts.avg.toFixed(1)}/day)`, tone: "good" });
  }

  const toneCls = { good: "bg-emerald-50 text-emerald-800 ring-emerald-200", warn: "bg-amber-50 text-amber-800 ring-amber-200", bad: "bg-red-50 text-red-800 ring-red-200" };

  return (
    <div className="space-y-6">
      <SectionTitle
        title={`📋 Weekly Review: ${rep.name}`}
        subtitle={`${positionLabel(rep.position)} · ${wk.label}`}
        accent="bg-brand-gold"
      />

      {/* Top-line signals */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4 text-center">
          <div className="text-xs font-semibold text-slate-500">RELIABILITY (days worked)</div>
          <div className={`mt-1 text-4xl font-extrabold ${reliability < 60 ? "text-red-600" : reliability < 85 ? "text-amber-600" : "text-emerald-600"}`}>{reliability}%</div>
          <div className="text-xs text-slate-400">{daysActive} of {workdays.length} workdays</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-xs font-semibold text-slate-500">APPOINTMENTS SET / DAY</div>
          <div className="mt-1 text-4xl font-extrabold text-slate-800">{appts ? appts.avg.toFixed(1) : "—"}</div>
          <div className="text-xs text-slate-400">goal {appts?.goal ?? "—"} · {appts?.total ?? 0} total</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-xs font-semibold text-slate-500">PROCESS CALLS (training)</div>
          <div className="mt-1 text-4xl font-extrabold text-slate-800">{processTraining ? processTraining.total : "—"}</div>
          <div className="text-xs text-slate-400">last week total</div>
        </Card>
      </div>

      {/* Signal banners */}
      <div className="space-y-2">
        {signals.map((s, i) => (
          <div key={i} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 ${toneCls[s.tone]}`}>
            {s.tone === "good" ? "✅" : s.tone === "warn" ? "⚠️" : "🔴"} {s.label}
          </div>
        ))}
      </div>

      {/* Full weekly numbers */}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-left">
              <th className="px-4 py-3 font-semibold">KPI</th>
              <th className="px-3 py-3 text-right font-semibold">Week total</th>
              <th className="px-3 py-3 text-right font-semibold">Avg / logged day</th>
              <th className="px-3 py-3 text-right font-semibold">Goal</th>
              <th className="px-3 py-3 text-center font-semibold">Days logged</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5 font-medium text-slate-700">{r.k.emoji} {r.k.name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatValue(r.k.unit as Unit, r.total)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatValue(r.k.unit as Unit, r.avg)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{r.goal === null ? "—" : formatValue(r.k.unit as Unit, r.goal)}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{r.daysLogged}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-5">
        <h3 className="mb-2 text-sm font-bold text-slate-700">Decision context</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li><strong>Role:</strong> {positionLabel(rep.position)}. {rep.note || "—"}</li>
          <li><strong>Output that pays:</strong> appointments set, this is the deliverable for a lead manager.</li>
          <li><strong>Training:</strong> process calls (in progress). Weigh whether a 2nd lead manager is justified by current lead volume.</li>
          <li><strong>Reliability</strong> reflects days logged vs Mon–Fri; low % often signals the known power/internet issues.</li>
        </ul>
        <p className="mt-3 text-xs text-slate-400">Numbers are last completed week ({wk.label}). Adjust the week with ?date=YYYY-MM-DD.</p>
      </Card>
    </div>
  );
}
