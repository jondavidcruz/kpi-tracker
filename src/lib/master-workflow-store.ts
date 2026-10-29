import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_WORKFLOW, type WorkflowConfig } from "@/lib/master-workflow";

// ⚙️ Owner-editable Master Workflow config (Jon 2026-10-29) — the inbound-reply auto-tag keywords
// + follow-up timings, in Resource "__master_workflow__". No migration. Falls back to defaults.
const CAT = "__master_workflow__";

const days = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(365, Math.round(n))) : fallback;
};
const words = (v: unknown, fallback: string[]) =>
  Array.isArray(v) && v.length ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 150) : fallback;

export async function loadWorkflowConfig(): Promise<WorkflowConfig> {
  try {
    const row = await db.resource.findFirst({ where: { category: CAT } });
    if (!row?.description) return DEFAULT_WORKFLOW;
    const r = JSON.parse(row.description) as Partial<WorkflowConfig>;
    return {
      realtorKeywords: words(r.realtorKeywords, DEFAULT_WORKFLOW.realtorKeywords),
      qualifiedKeywords: words(r.qualifiedKeywords, DEFAULT_WORKFLOW.qualifiedKeywords),
      notInterestedDays: days(r.notInterestedDays, DEFAULT_WORKFLOW.notInterestedDays),
      realtorDays: days(r.realtorDays, DEFAULT_WORKFLOW.realtorDays),
    };
  } catch { return DEFAULT_WORKFLOW; }
}

export async function saveWorkflowConfig(cfg: WorkflowConfig): Promise<void> {
  const clean: WorkflowConfig = {
    realtorKeywords: words(cfg.realtorKeywords, DEFAULT_WORKFLOW.realtorKeywords),
    qualifiedKeywords: words(cfg.qualifiedKeywords, DEFAULT_WORKFLOW.qualifiedKeywords),
    notInterestedDays: days(cfg.notInterestedDays, DEFAULT_WORKFLOW.notInterestedDays),
    realtorDays: days(cfg.realtorDays, DEFAULT_WORKFLOW.realtorDays),
  };
  const payload = JSON.stringify(clean);
  const row = await db.resource.findFirst({ where: { category: CAT } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: payload } });
  else await db.resource.create({ data: { title: "master-workflow", category: CAT, url: "", description: payload } });
}
