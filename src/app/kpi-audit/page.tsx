import Link from "next/link";
import { getCurrentUser, canAccessCSuite } from "@/lib/auth";
import { getAllUsers } from "@/lib/data";
import { Card, SectionTitle } from "@/components/ui";
import { kpiProofsFor, type KpiProof } from "@/lib/kpi-receipts";
import { secondaryPositionOf } from "@/lib/roles";

export const dynamic = "force-dynamic";

const PT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const shiftDay = (ymd: string, days: number) => { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const startOfWeek = (ymd: string) => { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }; // Monday
const startOfMonth = (ymd: string) => ymd.slice(0, 8) + "01";
const endOfMonth = (ymd: string) => { const d = new Date(ymd.slice(0, 8) + "01T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };

const RANGES = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "lastweek", label: "Last week" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "custom", label: "Custom" },
] as const;

/** Resolve a range preset (or custom from/to) → inclusive [from,to] in PT. */
function resolveRange(range: string, from?: string, to?: string): { from: string; to: string; label: string } {
  const today = PT_TODAY();
  switch (range) {
    case "week": return { from: startOfWeek(today), to: today, label: "This week" };
    case "lastweek": { const lw = shiftDay(startOfWeek(today), -7); return { from: lw, to: shiftDay(lw, 6), label: "Last week" }; }
    case "month": return { from: startOfMonth(today), to: today, label: "This month" };
    case "lastmonth": { const lm = shiftDay(startOfMonth(today), -1); return { from: startOfMonth(lm), to: endOfMonth(lm), label: "Last month" }; }
    case "custom": { const f = from || today, t = to || today; return f <= t ? { from: f, to: t, label: "Custom" } : { from: t, to: f, label: "Custom" }; }
    default: return { from: today, to: today, label: "Today" };
  }
}

function statusChip(p: KpiProof) {
  switch (p.status) {
    case "over_reported": return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">🔴 reported {p.recorded}, records show {p.systemCount}</span>;
    case "under_credited": return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">🟡 records show {p.systemCount}, scorecard has {p.recorded}</span>;
    case "records_only": return <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">ℹ️ {p.systemCount} in records (not on scorecard yet)</span>;
    case "auto": return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">🟢 auto-tracked — matches records</span>;
    default: return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">🟢 matches records</span>;
  }
}

export default async function KpiAuditPage({ searchParams }: { searchParams: Promise<{ rep?: string; date?: string; range?: string; from?: string; to?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  if (!canAccessCSuite(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">C-suite only</h1>
        <p className="mt-1 text-sm text-slate-500">KPI verification is limited to C-suite members.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const sp = await searchParams;
  const users = (await getAllUsers()).filter((u) => u.active);
  // Reps worth auditing: anyone whose primary/secondary role is dispositions (these KPIs live there).
  const dispo = users.filter((u) => u.position === "dispositions" || secondaryPositionOf(u) === "dispositions");
  const rep = sp.rep || dispo[0]?.id || "";
  const repUser = users.find((u) => u.id === rep) ?? null;
  // Range: a preset (today/week/lastweek/month/lastmonth) or custom from/to. A legacy ?date= still works.
  const rangeKey = sp.range || (sp.date ? "custom" : "today");
  const range = resolveRange(rangeKey, sp.from ?? sp.date, sp.to ?? sp.date);
  const proofs = rep ? await kpiProofsFor(rep, range.from, range.to) : [];
  const flagged = proofs.filter((p) => p.status === "over_reported").length;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionTitle title="🧾 KPI Verification — trust but verify" subtitle="Every output number recomputed straight from the records behind it. Pick a day, week, or month and open any KPI to see the receipts — which cards, who, and when. C-suite only." accent={flagged ? "bg-red-500" : "bg-emerald-500"} />

      {/* Controls */}
      <Card className="p-4 space-y-3">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs"><span className="mb-0.5 font-semibold text-slate-500">Team member</span>
            <select name="rep" defaultValue={rep} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
              {dispo.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              {/* also allow auditing anyone else */}
              {users.filter((u) => !dispo.some((d) => d.id === u.id)).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.position})</option>)}
            </select>
          </label>
          <label className="flex flex-col text-xs"><span className="mb-0.5 font-semibold text-slate-500">Range</span>
            <select name="range" defaultValue={rangeKey} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
              {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-xs"><span className="mb-0.5 font-semibold text-slate-500">From (custom)</span>
            <input type="date" name="from" defaultValue={range.from} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          </label>
          <label className="flex flex-col text-xs"><span className="mb-0.5 font-semibold text-slate-500">To (custom)</span>
            <input type="date" name="to" defaultValue={range.to} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          </label>
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800">Check</button>
        </form>
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          <span className="mr-1 font-semibold text-slate-400">Quick:</span>
          {RANGES.filter((r) => r.key !== "custom").map((r) => (
            <Link key={r.key} href={`/kpi-audit?rep=${rep}&range=${r.key}`} className={`rounded-lg px-2 py-1 font-bold ${rangeKey === r.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{r.label}</Link>
          ))}
        </div>
      </Card>

      {repUser && (
        <div className="text-sm font-semibold text-slate-600">{repUser.name} · <span className="text-slate-400">{range.label}{range.from === range.to ? ` · ${range.from}` : ` · ${range.from} → ${range.to}`} (PT)</span>{flagged > 0 && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">{flagged} over-reported</span>}</div>
      )}

      {/* KPI proofs */}
      <div className="space-y-3">
        {proofs.map((p) => (
          <Card key={p.key} className={`p-4 ${p.status === "over_reported" ? "ring-2 ring-red-200" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg">{p.emoji}</span>
              <span className="text-sm font-extrabold text-slate-800">{p.name}</span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[12px] font-bold text-slate-700">records: {p.systemCount}</span>
              {p.recorded != null && <span className="text-[11px] text-slate-400">scorecard: {p.recorded}{p.enteredBy ? ` · by ${p.enteredBy}` : ""}</span>}
              <span className="ml-auto">{statusChip(p)}</span>
            </div>
            {p.receipts.length > 0 ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-[12px] font-bold text-indigo-600">🧾 See the {p.receipts.length} receipt{p.receipts.length === 1 ? "" : "s"}</summary>
                <ul className="mt-1.5 space-y-1">
                  {p.receipts.map((r, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-2 rounded-lg bg-slate-50 px-3 py-1.5 text-[12px]">
                      <span className="font-semibold text-slate-800">{r.label}</span>
                      {r.detail && <span className="text-slate-400">· {r.detail}</span>}
                      <span className="ml-auto text-[11px] text-slate-500">{r.at}</span>
                      {r.oppId && <Link href={`/crm/${r.oppId}`} className="text-[11px] font-semibold text-indigo-600 hover:underline">open →</Link>}
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              <p className="mt-1 text-[12px] text-slate-400">No records found for this period{p.recorded ? ` — but ${p.recorded} is on the scorecard. Where did it come from?` : "."}</p>
            )}
          </Card>
        ))}
        {proofs.length === 0 && <Card className="p-6 text-center text-sm text-slate-400">Pick a team member and range to verify their numbers against the records.</Card>}
      </div>

      <Card className="border-l-4 border-slate-300 p-4 text-[12px] text-slate-600">
        <b className="text-slate-800">How to read this:</b> the <b>records</b> number is recomputed live from what actually happened in the War Room (kanban stage-moves to “Vetted,” new cards created, contacts logged). <b>🟢 auto-tracked</b> means the scorecard pulls that number straight from the records — nobody types it. <b>🔴 over-reported</b> means a manually-entered scorecard number is higher than the records support — open the receipts and see what&apos;s really there. Carrier/manual KPIs without a records trail will say so.
      </Card>
    </div>
  );
}
