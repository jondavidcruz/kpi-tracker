import { db } from "./db";

// 🧩 Ensure the three dispo deal pipelines reflect their real processes (Jon 2026-10-22).
// The CASH pipeline is WHOLESALE — signed, but we find OFF-MARKET buyers (same find-a-
// buyer play as unsigned land), NOT a listing. So its stages mirror the find-buyers
// flow, not the novation listing flow. Idempotent + safe (only corrects stages when no
// deals have moved into the pipeline yet).
export const CASH_PIPELINE = "DS: Signed Off Market";
const CASH_STAGE_LABELS = [
  "🏁 New — Signed",
  "📣 Sent to Buyers/Agents",
  "📥 Offers In (goal 3)",
  "🤝 Buyer Assigned",
  "🟡 Escrow Opened",
  "💰 Closed / Won",
  "🪦 Dead",
];

export async function ensureCashPipeline(): Promise<void> {
  try {
    const { readGhlPipelinesRaw, writeGhlPipelines, stageSlug } = await import("./crm");
    const stages = CASH_STAGE_LABELS.map((label) => ({ key: stageSlug(label), label }));
    const raw = await readGhlPipelinesRaw();
    const existing = raw.find((p) => p.name === CASH_PIPELINE);
    if (!existing) { await writeGhlPipelines([...raw, { name: CASH_PIPELINE, stages }]); return; }
    const same = JSON.stringify(existing.stages.map((s) => s.label)) === JSON.stringify(CASH_STAGE_LABELS);
    if (!same) {
      const count = await db.crmOpportunity.count({ where: { pipeline: CASH_PIPELINE, archivedAt: null } }).catch(() => 1);
      if (count === 0) { existing.stages = stages; await writeGhlPipelines(raw); }
    }
  } catch { /* non-blocking */ }
}
