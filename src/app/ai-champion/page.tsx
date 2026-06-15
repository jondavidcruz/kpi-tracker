import { submitAiIdea, reviewAiSubmission, deleteAiSubmission } from "@/app/actions";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-1 block text-xs font-semibold text-slate-500";

const STATUS: Record<string, { label: string; cls: string }> = {
  submitted: { label: "Submitted", cls: "bg-slate-200 text-slate-700" },
  piloting: { label: "Piloting", cls: "bg-amber-100 text-amber-800" },
  proven: { label: "Proven 🏆", cls: "bg-emerald-100 text-emerald-800" },
  declined: { label: "Declined", cls: "bg-slate-200 text-slate-500" },
};

const PROMPTS: { area: string; ideas: string[] }[] = [
  { area: "🎯 Acquisitions", ideas: ["Auto-summarize seller calls into deal notes", "Draft objection-handling responses on the fly", "Generate follow-up texts from a call transcript"] },
  { area: "🤝 Dispositions", ideas: ["Auto-match new deals to the right cash buyers", "Draft buyer blast messages", "Turn comps into a clean one-pager"] },
  { area: "📣 Lead gen", ideas: ["Draft SMS replies to inbound leads", "Auto-score / qualify new leads", "Speed-to-lead auto-responder"] },
  { area: "🧮 Underwriting", ideas: ["Double-check ARV & repair estimates", "Flag deals outside the buy box"] },
  { area: "🗂 Ops & admin", ideas: ["Auto-generate weekly reports", "Draft & update SOPs", "Score acquisition calls (already live!)"] },
];

export default async function AiChampionPage({ searchParams }: { searchParams: Promise<{ sent?: string; empty?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const sp = await searchParams;
  const leader = isManager(me);
  const settings = await getSettings();

  const [subs, proven] = await Promise.all([
    db.aiSubmission.findMany({ where: leader ? {} : { submittedBy: me.name }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 }),
    db.aiSubmission.findMany({ where: { status: "proven" } }),
  ]);

  // Leaderboard from proven submissions
  const board = new Map<string, { count: number; reward: number }>();
  for (const s of proven) {
    const e = board.get(s.submittedBy) ?? { count: 0, reward: 0 };
    e.count += 1; e.reward += s.rewardAmount ?? 0; board.set(s.submittedBy, e);
  }
  const champions = [...board.entries()].sort((a, b) => b[1].count - a[1].count || b[1].reward - a[1].reward).slice(0, 6);
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: settings.orgTimezone, month: "short", day: "numeric" }).format(d);
  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

  return (
    <div className="space-y-6">
      <SectionTitle title="🤖 AI Champion" subtitle="Build an AI process that makes our work easier → prove it saves time → earn a bonus." accent="bg-violet-400" />

      {sp.sent && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Submitted! Leadership will review it.</div>}
      {sp.empty && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Add a title before submitting.</div>}

      {/* Leaderboard */}
      {champions.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold text-slate-700">🏆 AI Champions</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {champions.map(([name, e], i) => (
              <div key={name} className={`rounded-xl p-3 text-center ring-1 ${i === 0 ? "bg-amber-50 ring-brand-gold/40" : "bg-slate-50 ring-slate-200"}`}>
                <div className="text-xs text-slate-400">#{i + 1}</div>
                <div className="font-bold text-slate-800">{name}</div>
                <div className="text-xs text-slate-500">{e.count} proven{e.reward ? ` · ${money(e.reward)}` : ""}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Submit */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Submit an AI process</h3>
        <form action={submitAiIdea} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="sm:col-span-2"><span className={labelCls}>What did you build / propose?</span><input name="title" placeholder="e.g. Auto-draft buyer blast from a new contract" className={inputCls} required /></label>
          <label><span className={labelCls}>Tool used</span><input name="tool" placeholder="Claude / GHL / Zapier…" className={inputCls} /></label>
          <label className="sm:col-span-3"><span className={labelCls}>What it does — the task it solves</span><textarea name="description" rows={3} className={inputCls} /></label>
          <label><span className={labelCls}>Hours saved / week</span><input name="hoursSaved" placeholder="e.g. 4" className={inputCls} /></label>
          <label className="sm:col-span-2"><span className={labelCls}>Proof link (Loom / doc) — optional</span><input name="proofUrl" placeholder="https://…" className={inputCls} /></label>
          <div className="sm:col-span-3"><button className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700">Submit for review</button></div>
        </form>
      </Card>

      {/* Idea prompts */}
      <Card className="p-5">
        <h3 className="mb-1 text-sm font-bold text-slate-700">💡 Need an idea? Pick a repetitive task and automate it</h3>
        <p className="mb-3 text-xs text-slate-500">Any of these (or your own) — build it, prove it saves time, submit it.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PROMPTS.map((p) => (
            <div key={p.area} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="mb-1 text-sm font-bold text-slate-700">{p.area}</div>
              <ul className="space-y-0.5 text-xs text-slate-600">{p.ideas.map((x, i) => <li key={i}>• {x}</li>)}</ul>
            </div>
          ))}
        </div>
      </Card>

      <SectionTitle title={leader ? "All submissions" : "Your submissions"} subtitle={leader ? "Review, pilot, and reward proven ones" : "Track the status of what you've submitted"} accent="bg-emerald-400" />

      <div className="space-y-3">
        {subs.length === 0 && <Card className="p-10 text-center text-slate-400">No submissions yet — be the first AI Champion!</Card>}
        {subs.map((s) => {
          const st = STATUS[s.status] ?? STATUS.submitted;
          return (
            <Card key={s.id} id={`sub-${s.id}`} className="scroll-mt-4 p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
                {s.tool && <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">{s.tool}</span>}
                <span className="flex-1 font-bold text-slate-800">{s.title}</span>
                <span className="text-xs text-slate-400">{s.submittedBy} · {fmt(s.createdAt)}</span>
              </div>
              {s.description && <p className="mb-1 whitespace-pre-wrap text-sm text-slate-600">{s.description}</p>}
              <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                {s.hoursSaved != null && <span>⏱ ~{s.hoursSaved} hrs/wk saved</span>}
                {s.proofUrl && <a href={s.proofUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-navy hover:underline">View proof ↗</a>}
                {s.rewardAmount != null && s.rewardAmount > 0 && <span className="font-semibold text-emerald-700">Bonus: {money(s.rewardAmount)}</span>}
              </div>
              {s.reviewNote && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm text-slate-600">Leadership: {s.reviewNote}</p>}

              {leader && (
                <>
                  <form action={reviewAiSubmission} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                    <input type="hidden" name="id" value={s.id} />
                    <label><span className={labelCls}>Status</span><select name="status" defaultValue={s.status} className={`${inputCls} w-32`}>{Object.keys(STATUS).map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}</select></label>
                    <label><span className={labelCls}>Bonus $ (if proven)</span><input name="rewardAmount" defaultValue={s.rewardAmount ?? ""} placeholder="0" className={`${inputCls} w-28`} /></label>
                    <label className="flex-1"><span className={labelCls}>Note (emailed to submitter)</span><input name="reviewNote" defaultValue={s.reviewNote} className={inputCls} /></label>
                    <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Save</button>
                  </form>
                  <form action={deleteAiSubmission} className="mt-2">
                    <input type="hidden" name="id" value={s.id} />
                    <button className="text-xs font-medium text-slate-400 hover:text-red-600">Delete</button>
                  </form>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
