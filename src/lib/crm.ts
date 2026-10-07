// Acquisitions CRM core (Jon 2026-10-07: GHL replacement). Stage list is
// customizable: the coded defaults below can be overridden/renamed from a
// Resource row (__crm_stages__) without a deploy.
import { db } from "./db";
import { CRM_STAGES, stageSlug, type CrmStage } from "./crm-shared";

export { CRM_STAGES, STAGE_PROB, KIND_EMOJI, parseTags, stageSlug, type CrmStage } from "./crm-shared";

const STAGES_CAT = "__crm_stages__";

/** Stage list with owner overrides ({key → label} renames) applied. */
export async function crmStages(): Promise<CrmStage[]> {
  const row = await db.resource.findFirst({ where: { category: STAGES_CAT } }).catch(() => null);
  let renames: Record<string, string> = {};
  try { renames = row?.description ? JSON.parse(row.description) : {}; } catch { /* coded */ }
  return CRM_STAGES.map((s) => ({ ...s, label: renames[s.key] || s.label }));
}

/** One timeline row. Fire-and-forget safe. */
export async function logCrmEvent(e: { contactId: string; oppId?: string; kind: string; body?: string; meta?: object; actor?: string }) {
  await db.crmEvent.create({ data: { contactId: e.contactId, oppId: e.oppId ?? "", kind: e.kind, body: (e.body ?? "").slice(0, 2000), meta: (e.meta ?? undefined) as never, actor: e.actor ?? "" } }).catch(() => {});
}

// ── Multi-pipeline (GHL parity, Jon 2026-10-07: "aligned like GoHighLevel").
// The native "War Room" pipeline uses CRM_STAGES; the 4 imported GHL pipelines
// carry GHL's EXACT stage names, synced into Resource __crm_pipelines__.
export type CrmPipeline = { name: string; stages: CrmStage[] };
const PIPES_CAT = "__crm_pipelines__";
const PALETTE = ["bg-sky-100 text-sky-800", "bg-yellow-100 text-yellow-800", "bg-violet-100 text-violet-800", "bg-amber-100 text-amber-800", "bg-blue-100 text-blue-800", "bg-emerald-100 text-emerald-800", "bg-rose-100 text-rose-800", "bg-indigo-100 text-indigo-800", "bg-teal-100 text-teal-800", "bg-slate-200 text-slate-600"];

export async function readPipelines(): Promise<CrmPipeline[]> {
  const row = await db.resource.findFirst({ where: { category: PIPES_CAT } }).catch(() => null);
  let ghl: Array<{ name: string; stages: Array<{ key: string; label: string }> }> = [];
  try { ghl = row?.description ? JSON.parse(row.description) : []; } catch { /* none */ }
  const warroom: CrmPipeline = { name: "War Room", stages: await crmStages() };
  return [warroom, ...ghl.map((p) => ({ name: p.name, stages: p.stages.map((st, i) => ({ key: st.key, label: st.label, cls: PALETTE[i % PALETTE.length] })) }))];
}

export async function writeGhlPipelines(list: Array<{ name: string; stages: Array<{ key: string; label: string }> }>): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: PIPES_CAT } });
  const description = JSON.stringify(list);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "crm-pipelines", category: PIPES_CAT, url: "", description } });
}

