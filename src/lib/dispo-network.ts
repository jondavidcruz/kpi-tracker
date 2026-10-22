import { readPipelines } from "./crm";
import { db } from "./db";
import { isDevNetworkName, isAgentNetworkName, DISPO_DEV_PIPELINE, DISPO_AGENT_PIPELINE } from "./dispo-buyers";

// 🧭 Resolve the ACTUAL buyer-network pipeline names from the live CRM (Jon
// 2026-10-24). The dev/agent pipelines were renamed ("DS: Developers" /
// "DS: Buyer Agents") and may carry whitespace variants, so hard-coding the
// constants made every dev/agent query return zero. This matches by PATTERN against
// both the pipeline DEFINITIONS and the pipeline values actually stored on
// opportunities (so a whitespace/renamed variant on the opps is still found).
export async function resolveNetworkPipelines(): Promise<{ dev: string[]; agent: string[]; all: string[] }> {
  const pls = await readPipelines().catch(() => [] as { name: string }[]);
  // distinct pipeline values actually in use on opportunities — catches variants
  const used = await db.crmOpportunity.groupBy({ by: ["pipeline"], where: { archivedAt: null } }).catch(() => [] as { pipeline: string }[]);
  const names = [...new Set([...pls.map((p) => p.name), ...used.map((u) => u.pipeline)])].filter(Boolean);
  let dev = names.filter(isDevNetworkName);
  let agent = names.filter(isAgentNetworkName);
  if (!dev.length) dev = [DISPO_DEV_PIPELINE];
  if (!agent.length) agent = [DISPO_AGENT_PIPELINE];
  return { dev, agent, all: [...dev, ...agent] };
}
