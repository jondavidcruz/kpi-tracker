import Link from "next/link";
import { getCurrentUser, canAccessCSuite } from "@/lib/auth";
import { getAllUsers } from "@/lib/data";
import { Card, SectionTitle } from "@/components/ui";
import { kpiProofsFor, type KpiProof } from "@/lib/kpi-receipts";
import { secondaryPositionOf } from "@/lib/roles";

export const dynamic = "force-dynamic";

const PT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const shiftDay = (ymd: string, days: number) => { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

function statusChip(p: KpiProof) {
  switch (p.status) {
    case "over_reported": return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">🔴 reported {p.recorded}, records show {p.systemCount}</span>;
    case "under_credited": return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">🟡 records show {p.systemCount}, scorecard has {p.recorded}</span>;
    case "records_only": return <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">ℹ️ {p.systemCount} in records (not on scorecard yet)</span>;
    case "auto": return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">🟢 auto-tracked — matches records</span>;
    default: return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">🟢 matches records</span>;
  }
}

export default async function KpiAuditPage({ searchParams }: { searchParams: Promise<{ rep?: string; date?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  if (!canAccessCSuite(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Leadership only</h1>
        <p className="mt-1 text-sm text-slate-500">KPI verification is C-suite only.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const sp = await searchParams;
  const users = (await getAllUsers()).filter((u) => u.active);
  // Reps worth auditing: anyone whose primary/secondary role is dispositions (these KPIs live there).
  const dispo = users.filter((u) => u.position === "dispositions" || secondaryPositionOf(u) === "dispositions");
  const date = sp.date || PT_TODAY();
  const rep = sp.rep || dispo[0]?.id || "";
  const repUser = users.find((u) => u.id === rep) ?? null;
  const proofs = rep ? await kpiProofsFor(rep, date) : [];
  const flagged = proofs.filter((p) => p.status === "over_reported").length;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionTitle title="🧾 KPI Verification — trust but verify" subtitle="Every output number recomputed straight from the records behind it. Click a KPI to see the receipts — which cards, who, and when. Leadership only." accent={flagged ? "bg-red-500" : "bg-emerald-500"} />

      {/* Controls */}
      <Card className="p-4">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs"><span className="mb-0.5 font-semibold text-slate-500">Team member</span>
            <select name="rep" defaultValue={rep} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
              {dispo.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              {/* also allow auditing anyone else */}
              {users.filter((u) => !dispo.some((d) => d.id === u.id)).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.position})</option>)}
            </select>
          </label>
          <label className="flex flex-col text-xs"><span className="mb-0.5 font-semibold text-slate-500">Date (PT)</span>
            <input type="date" name="date" defaultValue={date} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          </label>
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800">Check</button>
          <div className="ml-auto flex items-center gap-1 text-[11px]">
            <Link href={`/kpi-audit?rep=${rep}&date=${shiftDay(date, -1)}`} className="rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-600 hover:bg-slate-200">← prev day</Link>
            <Link href={`/kpi-audit?rep=${rep}&date=${PT_TODAY()}`} className="rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-600 hover:bg-slate-200">today</Link>
            <Link href={`/kpi-audit?rep=${rep}&date=${shiftDay(date, 1)}`} className="rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-600 hover:bg-slate-200">next day →</Link>
          </div>
        </form>
      </Card>

      {repUser && (
        <div className="text-sm font-semibold text-slate-600">{repUser.name} · <span className="text-slate-400">{date} (PT)</span>{flagged > 0 && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">{flagged} over-reported</span>}</div>
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
              <p className="mt-1 text-[12px] text-slate-400">No records found for this day{p.recorded ? ` — but ${p.recorded} is on the scorecard. Where did it come from?` : "."}</p>
            )}
          </Card>
        ))}
        {proofs.length === 0 && <Card className="p-6 text-center text-sm text-slate-400">Pick a team member and date to verify their numbers against the records.</Card>}
      </div>

      <Card className="border-l-4 border-slate-300 p-4 text-[12px] text-slate-600">
        <b className="text-slate-800">How to read this:</b> the <b>records</b> number is recomputed live from what actually happened in the War Room (kanban stage-moves to “Vetted,” new cards created, contacts logged). <b>🟢 auto-tracked</b> means the scorecard pulls that number straight from the records — nobody types it. <b>🔴 over-reported</b> means a manually-entered scorecard number is higher than the records support — open the receipts and see what&apos;s really there. Carrier/manual KPIs without a records trail will say so.
      </Card>
    </div>
  );
}
