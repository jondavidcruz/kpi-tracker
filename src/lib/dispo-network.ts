import { readPipelines } from "./crm";
import { isDevNetworkName, isAgentNetworkName, DISPO_DEV_PIPELINE, DISPO_AGENT_PIPELINE } from "./dispo-buyers";

// 🧭 Resolve the ACTUAL buyer-network pipeline names from the live CRM (Jon
// 2026-10-24). The dev/agent pipelines were renamed ("DS: Developers" /
// "DS: Buyer Agents") and may carry whitespace variants, so hard-coding the
// constants made every dev/agent query return zero. This looks up the real names
// by pattern so attach-search, Smart Match, counts and tabs always find them.
export async function resolveNetworkPipelines(): Promise<{ dev: string[]; agent: string[]; all: string[] }> {
  const pls = await readPipelines().catch(() => [] as { name: string }[]);
  let dev = pls.filter((p) => isDevNetworkName(p.name)).map((p) => p.name);
  let agent = pls.filter((p) => isAgentNetworkName(p.name)).map((p) => p.name);
  // Fallback to the canonical constants if the CRM list came back empty.
  if (!dev.length) dev = [DISPO_DEV_PIPELINE];
  if (!agent.length) agent = [DISPO_AGENT_PIPELINE];
  return { dev, agent, all: [...dev, ...agent] };
}
