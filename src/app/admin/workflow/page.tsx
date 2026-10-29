// ⚙️ Owner-only Master Workflow editor (Jon 2026-10-29): tune the inbound-reply auto-tag
// keywords + the follow-up timings yourself — no code change. Core automation → OWNER-ONLY.
import { getCurrentUser, isOwner } from "@/lib/auth";
import { loadWorkflowConfig } from "@/lib/master-workflow-store";
import { saveWorkflowAction } from "@/app/actions";
import { Card } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function WorkflowPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!isOwner(me)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Owner only</h1>
        <p className="mt-2 text-sm text-slate-500">The Master Workflow rules are limited to the owner.</p>
      </div>
    );
  }
  const cfg = await loadWorkflowConfig();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <Link href="/admin" className="text-xs font-bold text-slate-400 hover:text-slate-600">← Admin</Link>
        <h1 className="mt-1 text-xl font-bold text-slate-800">⚙️ Master Workflow — inbound reply rules</h1>
        <p className="mt-1 text-sm text-slate-500">When a seller replies to a text, we auto-tag their intent and schedule the next follow-up so nothing gets lost and the team only works the hot ones. Tune the trigger words and timings here — changes apply to new replies immediately. (Keyword match, no AI cost; the STOP / not-interested AI screen still runs as a fallback.)</p>
      </div>
      {sp.saved && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">✓ Saved — new inbound replies use these rules now.</div>}

      <form action={saveWorkflowAction} className="space-y-4">
        <Card className="p-4">
          <div className="text-sm font-bold text-slate-800">🤝 &ldquo;Working with a realtor / already listed&rdquo;</div>
          <p className="mt-0.5 text-[12px] text-slate-500">If the reply contains any of these, we tag it <b>working-with-realtor</b>, nudge it to a nurture stage, and snooze the follow-up (their listing may expire). One phrase per line or comma-separated.</p>
          <textarea name="realtorKeywords" rows={4} defaultValue={cfg.realtorKeywords.join(", ")} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <label className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-600">Follow up again in
            <input name="realtorDays" type="number" min={0} max={365} defaultValue={cfg.realtorDays} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm" /> days
          </label>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-bold text-slate-800">✅ &ldquo;Qualified / interested&rdquo;</div>
          <p className="mt-0.5 text-[12px] text-slate-500">If the reply contains any of these, we tag it <b>qualified</b> and surface it to the team <b>now</b> (no snooze). One phrase per line or comma-separated.</p>
          <textarea name="qualifiedKeywords" rows={4} defaultValue={cfg.qualifiedKeywords.join(", ")} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </Card>

        <Card className="p-4">
          <div className="text-sm font-bold text-slate-800">🚫 &ldquo;Not interested&rdquo;</div>
          <p className="mt-0.5 text-[12px] text-slate-500">Detected by the built-in decline/STOP filter (not keyword-edited here). When it fires, we tag <b>not-interested</b>, move it to nurture, and circle back later.</p>
          <label className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-600">Circle back in
            <input name="notInterestedDays" type="number" min={0} max={365} defaultValue={cfg.notInterestedDays} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm" /> days
          </label>
        </Card>

        <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-bold text-white hover:opacity-90">Save workflow rules</button>
      </form>
    </div>
  );
}
