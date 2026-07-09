import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getActiveReps } from "@/lib/data";
import { scoreCall, saveCallScript, deleteCallScore } from "@/app/actions";
import { friendlyDate } from "@/lib/date";
import { Card, SectionTitle } from "@/components/ui";
import type { ScoreArea } from "@/lib/score";
import { CALL_TYPES, callTypeLabel } from "@/lib/call-types";
import CallReview from "@/components/CallReview";
import TranscriptField from "@/components/TranscriptField";
import CallLeadFields from "@/components/CallLeadFields";

const GROUPS = ["Acquisitions", "Dispositions"] as const;

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";

function scoreColor(n: number): string {
  return n >= 80 ? "text-emerald-600" : n >= 60 ? "text-amber-600" : "text-red-600";
}

export default async function CallScoringPage({ searchParams }: { searchParams: Promise<{ scored?: string; setup?: string; err?: string; saved?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return <Card className="mx-auto max-w-md p-8 text-center">Please sign in.</Card>;
  const sp = await searchParams;
  const leader = isManager(me);

  const [reps, scores, scriptRows] = await Promise.all([
    getActiveReps(),
    db.callScore.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
    db.callScript.findMany(),
  ]);
  const scripts = new Map(scriptRows.map((r) => [r.callType, r.script]));
  const configured = !!process.env.ANTHROPIC_API_KEY;
  return (
    <div className="space-y-7">
      <SectionTitle
        title="🎧 Call Scoring"
        subtitle="Upload the call recording (saved to Google Drive) and paste the transcript for an instant coaching score. Diagnosis + feedback only."
        accent="bg-emerald-400"
      />

      <div className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200">
        <div className="font-bold">📝 How to add the transcript</div>
        <p className="mt-1 text-[13px] text-sky-800">Upload the recording (it saves to Google Drive), then transcribe it in <a href="https://gemini.google.com" target="_blank" rel="noopener noreferrer" className="font-semibold underline">Gemini</a> separately and <b>copy-paste the transcript</b> into the box below. Then hit Score this call.</p>
      </div>

      {!configured && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          <strong>Setup needed:</strong> add an <code>ANTHROPIC_API_KEY</code> in Vercel → Settings → Environment Variables, then redeploy. Scoring runs on your own pay-as-you-go key (~1-5¢ per call). Until then, scoring is disabled.
        </div>
      )}

      {sp.scored &&<div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Scored and saved below.</div>}
      {sp.saved && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Saved “{sp.saved}”.</div>}
      {sp.setup && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Scoring isn&apos;t configured yet — add the ANTHROPIC_API_KEY (see above).</div>}
      {sp.err === "short" && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Please paste a longer transcript.</div>}
      {sp.err === "noaudio" && <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 ring-1 ring-red-200">⚠️ Upload the call recording (audio file) too — a transcript alone won&apos;t save. Use 🎙️ Upload a recording above.</div>}
      {sp.err && !["short", "noaudio"].includes(sp.err) && <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 ring-1 ring-red-200">{sp.err}</div>}

      <Card className="p-5">
        <form action={scoreCall} className="space-y-3">
          <CallLeadFields
            inputCls={inputCls}
            reps={reps.map((r) => r.name)}
            types={CALL_TYPES.map((c) => ({ key: c.key, label: c.label, group: c.group, hasScript: scripts.has(c.key) }))}
            groups={[...GROUPS]}
          />
          <TranscriptField inputCls={inputCls} />
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
                    <div>
                      {s.direction && <span className="mr-1.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{s.direction === "inbound" ? "📥 Inbound" : "📤 Outbound"}</span>}
                      {s.callType && <span className="mr-2 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">{callTypeLabel(s.callType)}</span>}
                      <span className="font-bold text-slate-800">{s.repName}</span>
                      <span className="font-normal text-slate-400"> · scored by {s.scoredBy} · {friendlyDate(s.createdAt.toISOString().slice(0, 10))}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`text-3xl font-extrabold tabular-nums ${scoreColor(s.overall)}`}>{s.overall}<span className="text-base text-slate-400">/100</span></div>
                      {(leader || me.name === s.scoredBy) && (
                        <form action={deleteCallScore}>
                          <input type="hidden" name="id" value={s.id} />
                          <button className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-red-50 hover:text-red-600" title="Delete this score + its recording">🗑 Delete</button>
                        </form>
                      )}
                    </div>
                  </div>
                  {(s.address || s.sellerName || s.sellerPhone) && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      {s.address && <span>📍 {s.address}</span>}
                      {s.sellerName && <span>👤 {s.sellerName}</span>}
                      {s.sellerPhone && <a href={`tel:${s.sellerPhone}`} className="font-semibold text-brand-navy hover:underline">📞 {s.sellerPhone}</a>}
                    </div>
                  )}
                  {s.summary && <p className="mt-1 text-sm text-slate-600">{s.summary}</p>}
                  <CallReview id={s.id} stars={s.reviewStars} training={s.usedForTraining} canEdit={leader || me.name === s.scoredBy} />
                  {s.audioUrl && <audio controls src={s.audioUrl} className="mt-2 h-9 w-full max-w-md" />}
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

      {/* Manage scripts — leadership pastes the approved script per call type;
          the AI scores adherence against it. */}
      {leader && (
        <section id="scripts" className="scroll-mt-4">
          <SectionTitle title="📋 Call scripts" subtitle="Paste the approved script for each call type. The score then measures how well the rep followed it." accent="bg-brand-navy" />
          <div className="space-y-2">
            {GROUPS.map((g) => (
              <div key={g}>
                <h3 className="mb-1 mt-2 text-xs font-bold uppercase tracking-wide text-slate-400">{g}</h3>
                {CALL_TYPES.filter((c) => c.group === g).map((c) => {
                  const has = !!scripts.get(c.key);
                  return (
                    <details key={c.key} className="mb-1.5 rounded-lg border border-slate-200 bg-white p-2">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                        {has ? "✅" : "⬜️"} {c.label}
                      </summary>
                      <form action={saveCallScript} className="mt-2 space-y-2">
                        <input type="hidden" name="callType" value={c.key} />
                        <textarea name="script" defaultValue={scripts.get(c.key) ?? ""} rows={8} placeholder={`Paste the ${c.label} script / process here…`} className={inputCls} />
                        <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Save script</button>
                      </form>
                    </details>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
