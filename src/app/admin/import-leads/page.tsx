// 📥 Owner/manager: upload a CSV lead list, split it across reps by a weighted ratio, and import
// into the CRM — deduped, tagged with a sequence so the team can track which list a lead came from.
// No welcome SMS/email is sent (bulk list); each new lead gets a "call now" task. (Jon 2026-11-06)
import { getCurrentUser, isManager } from "@/lib/auth";
import LeadImporter from "@/components/LeadImporter";
import { LEAD_SOURCES } from "@/lib/lead-source";
import { getActiveReps } from "@/lib/data";
import { readPipelines } from "@/lib/crm";

export const dynamic = "force-dynamic";

export default async function ImportLeadsPage() {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <p className="mt-2 text-sm text-slate-500">Lead import is limited to leadership.</p>
      </div>
    );
  }
  const [reps, pipelines] = await Promise.all([getActiveReps(), readPipelines()]);
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">📥 Import a lead list</h1>
        <p className="mt-1 text-sm text-slate-500">Upload a CSV, set exactly how it should be imported — who gets the leads, house vs land, tasks, tags — then import. Leads are deduped by phone/email and tagged with a list sequence; no welcome text/email is sent to a bulk list.</p>
      </div>
      <LeadImporter
        sources={LEAD_SOURCES.map((s) => ({ value: s.value, label: s.label }))}
        repNames={reps.map((r) => r.name)}
        pipelines={pipelines.map((p) => p.name)}
      />
    </div>
  );
}
