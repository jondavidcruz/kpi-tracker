import Link from "next/link";
import { getCurrentUser, canAccessCSuite } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { readPipelines } from "@/lib/crm";
import { readRules } from "@/lib/crm-automations";
import { readSequences } from "@/lib/crm-templates";
import { saveAutomationAction } from "../actions";

export const dynamic = "force-dynamic";

// 🤖 Automations — Direct REI-style when → then rules, in their own room.
export default async function CrmAutomationsPage() {
  const me = await getCurrentUser();
  if (!me || !canAccessCSuite(me)) return <Card className="p-10 text-center text-slate-400">🔒 System Settings — C-suite only.</Card>;
  const [rules, pipelines, sequences] = await Promise.all([readRules(), readPipelines(), readSequences()]);

  return (
    <div className="space-y-4">
      <SectionTitle title="🤖 Automations" subtitle="Simple when → then rules, like Direct REI: a lead enters a stage, the War Room does the busywork." accent="bg-brand-gold"
        right={<Link href="/crm" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">🗂 Pipeline</Link>} />

      <Card className="p-4">
        <div className="space-y-1.5">
          {rules.map((r) => (
            <div key={r.id} className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-1.5 text-xs ring-1 ${r.enabled ? "bg-emerald-50/60 ring-emerald-100" : "bg-slate-50 ring-slate-100 opacity-60"}`}>
              <span className="font-bold text-slate-800">{r.name}</span>
              <span className="text-slate-500">when <b>{r.pipeline || "any pipeline"}</b> → <b>{r.stage}</b></span>
              <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 ring-1 ring-indigo-100">
                {r.action === "task" ? `➕ task "${r.params.title ?? r.name}" (+${r.params.dueDays ?? 0}d)` : r.action === "tag" ? `🏷 add #${r.params.tag}` : r.action === "followup" ? `📞 follow-up +${r.params.days}d` : `📧 enroll sequence`}
              </span>
              <span className="ml-auto flex gap-1.5">
                <form action={saveAutomationAction}><input type="hidden" name="op" value="toggle" /><input type="hidden" name="id" value={r.id} /><button className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-200">{r.enabled ? "pause" : "resume"}</button></form>
                <form action={saveAutomationAction}><input type="hidden" name="op" value="delete" /><input type="hidden" name="id" value={r.id} /><button className="rounded-md px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-red-500">✕</button></form>
              </span>
            </div>
          ))}
          {rules.length === 0 && <p className="text-xs text-slate-400">No rules yet — the first one takes 10 seconds below.</p>}
        </div>
        <form action={saveAutomationAction} className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 sm:grid-cols-2 lg:grid-cols-3">
          <input name="name" required placeholder="Rule name (e.g. Offer chase)" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
          <select name="trigger" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
            {pipelines.flatMap((pp) => pp.stages.map((st) => (
              <option key={`${pp.name}::${st.key}`} value={`${pp.name === "War Room" ? "" : pp.name}::${st.key}`}>when {pp.name} → {st.label}</option>
            )))}
          </select>
          <select name="action" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
            <option value="task">➕ create a task</option>
            <option value="followup">📞 set follow-up in N days</option>
            <option value="tag">🏷 add a tag</option>
            <option value="enroll">📧 enroll in email sequence</option>
          </select>
          <input name="p_title" placeholder="task title (for task)" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
          <div className="flex gap-2">
            <input name="p_dueDays" type="number" placeholder="task +days" className="w-1/2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
            <input name="p_days" type="number" placeholder="follow-up +days" className="w-1/2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
          </div>
          <div className="flex gap-2">
            <input name="p_tag" placeholder="tag (for tag)" className="w-1/2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
            <select name="p_seqId" className="w-1/2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
              <option value="">sequence…</option>
              {sequences.map((sq) => <option key={sq.id} value={sq.id}>{sq.name}</option>)}
            </select>
          </div>
          <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 lg:col-span-3">＋ Add automation</button>
        </form>
      </Card>
    </div>
  );
}
