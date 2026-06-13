import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveReps } from "@/lib/data";
import { scoreCall } from "@/app/actions";
import { friendlyDate } from "@/lib/date";
import { Card, SectionTitle } from "@/components/ui";
import type { ScoreArea } from "@/lib/score";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";

function scoreColor(n: number): string {
  return n >= 80 ? "text-emerald-600" : n >= 60 ? "text-amber-600" : "text-red-600";
}

export default async function CallScoringPage({ searchParams }: { searchParams: Promise<{ scored?: string; setup?: string; err?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return <Card className="mx-auto max-w-md p-8 text-center">Please sign in.</Card>;
  const sp = await searchParams;

  const [reps, scores] = await Promise.all([
    getActiveReps(),
    db.callScore.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
  ]);
  const configured = !!process.env.ANTHROPIC_API_KEY;

  return (
    <div className="space-y-7">
      <SectionTitle
        title="🎧 Call Scoring"
        subtitle="Paste an acquisitions call transcript for an instant coaching score. Diagnosis + feedback only."
        accent="bg-emerald-400"
      />

      {!configured && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          <strong>Setup needed:</strong> add an <code>ANTHROPIC_API_KEY</code> in Vercel → Settings → Environment Variables, then redeploy. Scoring runs on your own pay-as-you-go key (~1-5¢ per call). Until then, scoring is disabled.
        </div>
      )}
      {sp.scored && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Scored and saved below.</div>}
      {sp.setup && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Scoring isn&apos;t configured yet — add the ANTHROPIC_API_KEY (see above).</div>}
      {sp.err === "short" && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Please paste a longer transcript.</div>}
      {sp.err && sp.err !== "short" && <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 ring-1 ring-red-200">{sp.err}</div>}

      <Card className="p-5">
        <form action={scoreCall} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="sm:col-span-1">
              <span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Whose call?</span>
              <select name="repName" className={inputCls} defaultValue="">
                <option value="">Pick a rep…</option>
                {reps.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Call transcript</span>
            <textarea name="transcript" rows={8} placeholder="Paste the full call transcript here…" className={inputCls} />
          </label>
          <div>
            <button disabled={!configured} className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
              Score this call
            </button>
            <span className="ml-3 text-xs text-slate-400">Takes a few seconds. Feedback only — nothing is shared with the rep automatically.</span>
          </div>
        </form>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">Recent scores</h2>
        {scores.length === 0 ? (
          <Card className="p-8 text-center text-slate-400">No calls scored yet.</Card>
        ) : (
          <div className="space-y-3">
            {scores.map((s) => {
              const breakdown: ScoreArea[] = JSON.parse(s.breakdown || "[]");
              return (
                <Card key={s.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold text-slate-800">{s.repName} <span className="font-normal text-slate-400">· scored by {s.scoredBy} · {friendlyDate(s.createdAt.toISOString().slice(0, 10))}</span></div>
                    <div className={`text-3xl font-extrabold tabular-nums ${scoreColor(s.overall)}`}>{s.overall}<span className="text-base text-slate-400">/100</span></div>
                  </div>
                  {s.summary && <p className="mt-1 text-sm text-slate-600">{s.summary}</p>}
                  {breakdown.length > 0 && (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {breakdown.map((b, i) => (
                        <div key={i} className="rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-600">{b.area}</span>
                            <span className={`text-sm font-bold tabular-nums ${scoreColor(b.score)}`}>{b.score}</span>
                          </div>
                          {b.note && <p className="mt-0.5 text-xs text-slate-500">{b.note}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
