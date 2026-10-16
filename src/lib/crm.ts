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

// 🔒 Per-rep pipeline lock (Jon 2026-10-16: "give Kyle a new pipeline he can see
// but don't let him see any of our other leads" → then "let me choose MULTIPLE
// pipelines"). Maps a first name → the pipeline(s) that rep is confined to. A
// locked rep sees ONLY those pipelines' tabs and ONLY the leads inside them —
// every other pipeline and lead is hidden, server-side. Managers/admins are never
// locked. Stored in Resource __crm_pipeline_lock__. Value may be a single string
// (legacy rows) or an array — always read it through locksToArray().
const PIPE_LOCK_CAT = "__crm_pipeline_lock__";
export type PipeLockMap = Record<string, string | string[]>; // firstNameLower → pipeline name(s)

/** Normalize a stored lock value (string | string[] | undefined) to a clean array. */
export function locksToArray(v: string | string[] | undefined | null): string[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))];
}

export async function readPipelineLocks(): Promise<PipeLockMap> {
  const row = await db.resource.findFirst({ where: { category: PIPE_LOCK_CAT } }).catch(() => null);
  try { return row?.description ? JSON.parse(row.description) : {}; } catch { return {}; }
}

export async function writePipelineLocks(map: PipeLockMap): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: PIPE_LOCK_CAT } });
  const description = JSON.stringify(map);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "crm-pipeline-lock", category: PIPE_LOCK_CAT, url: "", description } });
}

/** The pipeline(s) a user is confined to, or null if unrestricted (managers never locked). */
export async function pipelineLockFor(user: { name?: string | null; role?: string | null } | null): Promise<string[] | null> {
  if (!user?.name) return null;
  if (user.role === "manager" || user.role === "admin") return null;
  const first = user.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const map = await readPipelineLocks();
  const arr = locksToArray(map[first]);
  return arr.length ? arr : null;
}

export async function readGhlPipelinesRaw(): Promise<Array<{ name: string; stages: Array<{ key: string; label: string }> }>> {
  const row = await db.resource.findFirst({ where: { category: PIPES_CAT } }).catch(() => null);
  try { return row?.description ? JSON.parse(row.description) : []; } catch { return []; }
}

export async function writeGhlPipelines(list: Array<{ name: string; stages: Array<{ key: string; label: string }> }>): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: PIPES_CAT } });
  const description = JSON.stringify(list);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "crm-pipelines", category: PIPES_CAT, url: "", description } });
}

