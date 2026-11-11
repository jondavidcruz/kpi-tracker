import { getCurrentUser, isManager, isOwner } from "@/lib/auth";
import { DRIP_SEQUENCES, STAGE_SEQ, getDripSeq, isDripAutoSendPaused, type DripSeq } from "@/lib/drip";
import { setDripPauseAction } from "@/app/crm/actions";
import { ACQ_STAGES } from "@/lib/stage-aliases";

export const dynamic = "force-dynamic";

// 📨 Automation sequences — the one place to SEE, per acquisition stage, how often we text/email
// the seller and exactly what goes out (Jon 2026-11-10). Read-only reference; the copy lives in
// src/lib/drip.ts. Level 2 (auto-send) sequences send themselves; Level 1 drops a ready-to-send task.
function cadence(seq: DripSeq) {
  const texts = seq.steps.filter((s) => s.channel === "sms").length;
  const emails = seq.steps.filter((s) => s.channel === "email").length;
  const span = Math.max(0, ...seq.steps.map((s) => s.delayDays));
  return { texts, emails, span };
}

export default async function SequencesPage() {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <p className="mt-2 text-sm text-slate-500">The automation sequences are limited to managers.</p>
      </div>
    );
  }

  // The non-stage sequence (manual-only, started from the deal dropdown).
  const stageSeqKeys = new Set(Object.values(STAGE_SEQ));
  const manualOnly = DRIP_SEQUENCES.filter((s) => !stageSeqKeys.has(s.key));
  const owner = isOwner(me);
  const paused = await isDripAutoSendPaused();

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-16">
      <div>
        <h1 className="text-2xl font-black text-slate-800">📨 Automation sequences</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every acquisition stage auto-starts a follow-up sequence the moment a seller lands on it. Below is
          exactly how often we text/email and what we send.
        </p>
        <div className="mt-2 space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          <div>🛑 <b>Any reply — text OR email — stops the sequence</b> and hands the lead to a human (a price → Comp/Offer, otherwise → Follow Up), so no one keeps getting the same message.</div>
          <div>📧 <b>Emails only go to sellers we&apos;ve already sent an offer to</b> (by then they gave us their real email) — everything before that is text-only.</div>
          <div>🕶 Every message is scrubbed of the company name and website before it sends — only a rep&apos;s first name goes out.</div>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[12px]">
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700 ring-1 ring-sky-200">📱 text</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 font-semibold text-violet-700 ring-1 ring-violet-200">📧 email</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700 ring-1 ring-amber-200">⚡ Level 2 — auto-sends itself</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-200">✋ Level 1 — drops a ready-to-send task</span>
        </div>
      </div>

      <div className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${paused ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50"}`}>
        <span className="text-[13px] font-bold">
          {paused
            ? "🛑 Auto-send is PAUSED — Level 2 stages are dropping ready-to-send tasks instead of sending."
            : "⚡ Auto-send is LIVE — Level 2 stages (Contract Sent, Nurture) send texts/emails on schedule."}
        </span>
        {owner && (
          <form action={async (fd: FormData) => { "use server"; await setDripPauseAction(fd); }} className="ml-auto">
            <input type="hidden" name="paused" value={paused ? "0" : "1"} />
            <button className={`rounded-lg px-3 py-1.5 text-[12px] font-bold text-white ${paused ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}`}>
              {paused ? "▶ Resume auto-send" : "⏸ Pause all auto-send"}
            </button>
          </form>
        )}
      </div>

      {ACQ_STAGES.map((stage) => {
        const seqKey = STAGE_SEQ[stage.key];
        const seq = seqKey ? getDripSeq(seqKey) : undefined;
        if (!seq) {
          return (
            <div key={stage.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-bold text-slate-700">{stage.label}</span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">Human — no automation</span>
              </div>
              <p className="mt-1 text-[13px] text-slate-500">Brand-new leads stay a manual speed-to-lead call/text — no automated messages here.</p>
            </div>
          );
        }
        const c = cadence(seq);
        const auto = seq.autoSend === true;
        return (
          <div key={stage.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <span className="text-[15px] font-black text-slate-800">{stage.label}</span>
              {auto
                ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-300">⚡ Level 2 · auto-sends</span>
                : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-300">✋ Level 1 · ready-to-send task</span>}
              <span className="ml-auto text-[12px] font-semibold text-slate-500">
                📱 {c.texts} text{c.texts === 1 ? "" : "s"} · 📧 {c.emails} email{c.emails === 1 ? "" : "s"} over {c.span} day{c.span === 1 ? "" : "s"}
              </span>
            </div>
            <ol className="divide-y divide-slate-100">
              {seq.steps.map((step, i) => (
                <li key={i} className="flex gap-3 px-4 py-3">
                  <div className="flex w-16 shrink-0 flex-col items-center">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">Day {step.delayDays}</span>
                    <span className="mt-1 text-[11px] font-semibold">{step.channel === "sms" ? "📱 Text" : "📧 Email"}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    {step.channel === "email" && <div className="text-[12px] font-bold text-slate-700">Subject: {step.emailSubject}</div>}
                    <div className="whitespace-pre-line text-[13px] leading-relaxed text-slate-600">{step.channel === "sms" ? step.sms : step.emailBody}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        );
      })}

      <p className="px-1 pt-2 text-[12px] text-slate-400">
        <span className="font-semibold">{"{first}"}</span>, <span className="font-semibold">{"{address}"}</span> and <span className="font-semibold">{"{rep}"}</span> fill in automatically from the lead. Every outbound message is scrubbed of any company/owner name before it sends. To change the wording or timing, edit <span className="font-mono">src/lib/drip.ts</span>.
      </p>

      {manualOnly.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-black text-slate-800">🖐 Manual-start sequences</h2>
          <p className="mb-2 mt-1 text-[13px] text-slate-500">Not tied to a stage — started by hand from a deal&apos;s &quot;Start sequence&quot; dropdown.</p>
          {manualOnly.map((seq) => {
            const c = cadence(seq);
            return (
              <div key={seq.key} className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <span className="text-[14px] font-black text-slate-800">{seq.name}</span>
                  <span className="ml-auto text-[12px] font-semibold text-slate-500">📱 {c.texts} · 📧 {c.emails} over {c.span} days</span>
                </div>
                <ol className="divide-y divide-slate-100">
                  {seq.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 px-4 py-3">
                      <div className="flex w-16 shrink-0 flex-col items-center">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">Day {step.delayDays}</span>
                        <span className="mt-1 text-[11px] font-semibold">{step.channel === "sms" ? "📱 Text" : "📧 Email"}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        {step.channel === "email" && <div className="text-[12px] font-bold text-slate-700">Subject: {step.emailSubject}</div>}
                        <div className="whitespace-pre-line text-[13px] leading-relaxed text-slate-600">{step.channel === "sms" ? step.sms : step.emailBody}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
