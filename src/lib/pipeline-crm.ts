import { db } from "./db";
import { isDispoDealPipeline, isDevNetworkName, isAgentNetworkName } from "./dispo-buyers";

// 🗂 Which CRM a pipeline belongs to (Jon 2026-10-24: "separate acquisition pipelines
// from disposition pipelines so we know which belongs to which CRM"). An EXPLICIT
// assignment (stored per pipeline) wins over name-pattern guessing, so a renamed or
// emoji-prefixed pipeline can never silently land in the wrong CRM again.
export type CrmGroup = "acquisitions" | "dispositions";
const CAT = "__pipeline_crm__";

export async function readPipelineCrm(): Promise<Record<string, CrmGroup>> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  if (!row?.description) return {};
  try { const j = JSON.parse(row.description); return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, CrmGroup>) : {}; } catch { return {}; }
}

export async function writePipelineCrm(map: Record<string, CrmGroup>): Promise<void> {
  const clean: Record<string, CrmGroup> = {};
  for (const [k, v] of Object.entries(map)) if (k && (v === "acquisitions" || v === "dispositions")) clean[k] = v;
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  const desc = JSON.stringify(clean);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: desc } });
  else await db.resource.create({ data: { title: "pipeline-crm", category: CAT, url: "", description: desc } });
}

/** Default CRM for a pipeline from its name (used when not explicitly assigned). */
export function patternGroup(name: string | null | undefined): CrmGroup {
  const n = name ?? "";
  return (isDispoDealPipeline(n) || isDevNetworkName(n) || isAgentNetworkName(n)) ? "dispositions" : "acquisitions";
}

/** The CRM a pipeline belongs to — explicit assignment first, else name pattern. */
export function crmGroupOf(name: string | null | undefined, map: Record<string, CrmGroup>): CrmGroup {
  const n = name ?? "";
  return map[n] ?? patternGroup(n);
}

/** Finer label for display inside the Dispositions group. */
export function dispoKind(name: string | null | undefined): "deal" | "developers" | "agents" | null {
  const n = name ?? "";
  if (isDevNetworkName(n)) return "developers";
  if (isAgentNetworkName(n)) return "agents";
  if (isDispoDealPipeline(n)) return "deal";
  return null;
}
