import Link from "next/link";
import { getCurrentUser, isManager, canAccessCSuite } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { computeKpiFlags, type KpiFlag } from "@/lib/kpi-flags";
import { logKpiFlagAction } from "@/app/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DIAG: Record<KpiFlag["diagnosis"]["kind"], { emoji: string; tag: string; cls: string }> = {
  goal_high: { emoji: "🎯", tag: "Goal too high", cls: "bg-amber-100 text-amber-800" },
  lead_volume: { emoji: "🚰", tag: "Not enough leads", cls: "bg-sky-100 text-sky-800" },
  tracking_gap: { emoji: "📡", tag: "Tracking gap", cls: "bg-violet-100 text-violet-800" },
  coaching: { emoji: "💪", tag: "Needs coaching", cls: "bg-rose-100 text-rose-800" },
};
const TREND: Record<KpiFlag["trend"], { emoji: string; label: string; cls: string }> = {
  improving: { emoji: "📈", label: "improving", cls: "text-emerald-600" },
  flat: { emoji: "➡️", label: "flat", cls: "text-slate-400" },
  worse: { emoji: "📉", label: "getting worse", cls: "text-red-600" },
};

export default async function KpiFlagsPage() {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Leadership only</h1>
        <p className="mt-1 text-sm text-slate-500">KPI Flags are for managers and leadership.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const owner = canAccessCSuite(me);
  const flags = await computeKpiFlags();
  const escalated = flags.filter((f) => f.escalated).length;
  const addressed = flags.filter((f) => f.addressed).length;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionTitle
        title="⚠️ KPI Flags — what's actually going wrong"
        subtitle="Sustained misses only (4+ of the last 7 days), de-duped to one living flag per person & KPI. Each one is diagnosed into the real cause and clears itself when they recover — no more daily task spam."
        accent={escalated ? "bg-red-500" : "bg-amber-400"}
      />

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center"><div className="text-2xl font-extrabold text-slate-800">{flags.length}</div><div className="text-[11px] font-semibold text-slate-400">open flags</div></Card>
        <Card className="p-4 text-center"><div className={`text-2xl font-extrabold ${escalated ? "text-red-600" : "text-slate-800"}`}>{escalated}</div><div className="text-[11px] font-semibold text-slate-400">escalated · 3+ days, no action</div></Card>
        <Card className="p-4 text-center"><div className="text-2xl font-extrabold text-emerald-600">{addressed}</div><div className="text-[11px] font-semibold text-slate-400">addressed by a manager</div></Card>
      </div>

      {owner && escalated > 0 && (
        <Card className="border-l-4 border-red-400 bg-red-50/50 p-4 text-sm text-red-800">
          <b>{escalated} flag{escalated === 1 ? " has" : "s have"} sat 3+ days with no coaching action logged.</b> These are the ones where the manager hasn&apos;t stepped in yet — they&apos;re marked 🚨 below.
        </Card>
      )}

      <div className="space-y-3">
        {flags.length === 0 && <Card className="p-8 text-center text-sm text-slate-400">No sustained KPI misses right now — nobody&apos;s stuck. 🎉</Card>}
        {flags.map((f) => {
          const d = DIAG[f.diagnosis.kind];
          const tr = TREND[f.trend];
          return (
            <Card key={f.key} className={`p-4 ${f.escalated ? "ring-2 ring-red-200" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg">{f.emoji}</span>
                <span className="text-sm font-extrabold text-slate-800">{f.userName.split(" ")[0]} · {f.kpiName}</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">missed {f.missLast7}/7 days</span>
                <span className={`text-[11px] font-bold ${tr.cls}`}>{tr.emoji} {tr.label}</span>
                {f.escalated && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">🚨 escalated · {f.daysOpen}d, no action</span>}
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${d.cls}`}>{d.emoji} {d.tag}</span>
              </div>

              <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                <div><b className="text-slate-800">What&apos;s going on:</b> {f.diagnosis.label}.</div>
                <div className="mt-0.5"><b className="text-slate-800">Do this:</b> {f.diagnosis.fix}</div>
                {f.diagnosis.recalibrate && <Link href="/admin/recalibrate" className="mt-1 inline-block text-[11px] font-bold text-indigo-600 hover:underline">→ Open goal recalibration</Link>}
              </div>

              {f.action ? (
                <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800 ring-1 ring-emerald-100">
                  ✅ <b>{f.action.by.split(" ")[0]}</b> logged an action {new Date(f.action.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: &ldquo;{f.action.note}&rdquo;
                  {!f.addressed && <span className="ml-1 text-amber-700">(before this flare — flag re-opened)</span>}
                </div>
              ) : (
                <div className="mt-2 text-[11px] font-semibold text-slate-400">No coaching action logged yet{f.escalated ? " — this is overdue." : "."}</div>
              )}

              <form action={logKpiFlagAction} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="hidden" name="key" value={f.key} />
                <input name="note" placeholder="What did you do about it? (coached, recalibrated, reassigned…)" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
                <button className="rounded-lg bg-brand-navy px-3 py-1.5 text-[11px] font-bold text-white hover:opacity-90">Log action</button>
              </form>
            </Card>
          );
        })}
      </div>

      <Card className="border-l-4 border-slate-300 p-4 text-[12px] text-slate-600">
        <b className="text-slate-800">How this works:</b> a flag only appears when someone misses a goal 4+ of the last 7 days — a slow day won&apos;t trigger it. Each is diagnosed from the data: <b>🎯 goal too high</b> (median far below goal → recalibrate), <b>🚰 not enough leads</b> (upstream activity is also short → lead-flow problem), <b>📡 tracking gap</b> (auto-fed KPI reading 0 → confirm they work in-app), or <b>💪 needs coaching</b> (volume&apos;s there, goal&apos;s fair). Log what you did; a flag with no action for 3+ days escalates to the owner. Flags clear themselves the moment the rep recovers.
      </Card>
    </div>
  );
}
