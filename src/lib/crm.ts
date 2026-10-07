// Acquisitions CRM core (Jon 2026-10-07: GHL replacement). Stage list is
// customizable: the coded defaults below can be overridden/renamed from a
// Resource row (__crm_stages__) without a deploy.
import { db } from "./db";

export type CrmStage = { key: string; label: string; cls: string };

// Built around Jon's land SOP — including the 24–48h developer-pricing stage.
export const CRM_STAGES: CrmStage[] = [
  { key: "new", label: "New Lead", cls: "bg-sky-100 text-sky-800" },
  { key: "contacted", label: "Contacted", cls: "bg-yellow-100 text-yellow-800" },
  { key: "process_call", label: "Process Call ✓", cls: "bg-violet-100 text-violet-800" },
  { key: "at_developers", label: "🏗 At Developers", cls: "bg-amber-100 text-amber-800" },
  { key: "offer_made", label: "Offer Made", cls: "bg-blue-100 text-blue-800" },
  { key: "contract_sent", label: "Contract Sent", cls: "bg-emerald-100 text-emerald-800" },
  { key: "signed", label: "Signed 🎉", cls: "bg-emerald-200 text-emerald-900" },
  { key: "nurture", label: "🌱 Nurture", cls: "bg-lime-100 text-lime-800" },
  { key: "dead", label: "Dead", cls: "bg-slate-200 text-slate-600" },
];

const STAGES_CAT = "__crm_stages__";

/** Stage list with owner overrides ({key → label} renames) applied. */
export async function crmStages(): Promise<CrmStage[]> {
  const row = await db.resource.findFirst({ where: { category: STAGES_CAT } }).catch(() => null);
  let renames: Record<string, string> = {};
  try { renames = row?.description ? JSON.parse(row.description) : {}; } catch { /* coded */ }
  return CRM_STAGES.map((s) => ({ ...s, label: renames[s.key] || s.label }));
}

export function parseTags(s: string): string[] {
  return s.split(",").map((t) => t.trim()).filter(Boolean);
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

export function stageSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "stage";
}

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

// Pipedrive-style stage probabilities → weighted pipeline value per column.
export const STAGE_PROB: Record<string, number> = {
  new: 0.05, contacted: 0.1, process_call: 0.25, at_developers: 0.4,
  offer_made: 0.6, contract_sent: 0.8, signed: 1, nurture: 0.02, dead: 0,
};

export const KIND_EMOJI: Record<string, string> = {
  note: "📝", call: "📞", sms: "💬", email: "✉️", stage: "🔀", task: "✅", appt: "📅", system: "✨",
};
