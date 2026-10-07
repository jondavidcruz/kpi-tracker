// CRM automations (Jon 2026-10-07: "with certain leads and to certain stages
// I want it to trigger certain events" — Direct REI-style, visible list).
// Rules live in Resource __crm_automations__ and fire on stage changes.
import { db } from "./db";
import { logCrmEvent } from "./crm";

const CAT = "__crm_automations__";

export type CrmRule = {
  id: string;
  name: string;
  pipeline: string; // "" = any pipeline
  stage: string; // stage KEY that triggers on entry
  action: "task" | "tag" | "followup" | "enroll";
  // params: task → title + dueDays · tag → tag · followup → days · enroll → seqId
  params: { title?: string; dueDays?: number; tag?: string; days?: number; seqId?: string };
  enabled: boolean;
  createdBy: string;
};

export async function readRules(): Promise<CrmRule[]> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  try { return row?.description ? JSON.parse(row.description) : []; } catch { return []; }
}

export async function writeRules(rules: CrmRule[]): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: CAT } });
  const description = JSON.stringify(rules.slice(0, 50));
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "crm-automations", category: CAT, url: "", description } });
}

/** Fire every enabled rule matching this stage entry. Never throws. */
export async function runStageAutomations(opp: { id: string; contactId: string; pipeline: string; stage: string; assignedTo: string; title: string }): Promise<void> {
  try {
    const rules = (await readRules()).filter((r) => r.enabled && r.stage === opp.stage && (!r.pipeline || r.pipeline === opp.pipeline));
    const today = new Date().toISOString().slice(0, 10);
    for (const r of rules) {
      if (r.action === "task") {
        const due = new Date(Date.now() + (r.params.dueDays ?? 0) * 86400000).toISOString().slice(0, 10);
        await db.crmTask.create({ data: { contactId: opp.contactId, oppId: opp.id, title: r.params.title || r.name, due, assignedTo: opp.assignedTo, createdBy: `automation:${r.name}` } });
      } else if (r.action === "tag" && r.params.tag) {
        const o = await db.crmOpportunity.findUnique({ where: { id: opp.id }, select: { tags: true } });
        if (o && !o.tags.toLowerCase().includes(r.params.tag.toLowerCase())) {
          await db.crmOpportunity.update({ where: { id: opp.id }, data: { tags: o.tags ? `${o.tags}, ${r.params.tag}` : r.params.tag } });
        }
      } else if (r.action === "followup") {
        const nf = new Date(Date.now() + (r.params.days ?? 1) * 86400000).toISOString().slice(0, 10);
        await db.crmOpportunity.update({ where: { id: opp.id }, data: { nextFollowUp: nf } });
      } else if (r.action === "enroll" && r.params.seqId) {
        const { readSeqState, writeSeqState, readSequences, ymdPlus } = await import("./crm-templates");
        const contact = await db.crmContact.findUnique({ where: { id: opp.contactId }, select: { email: true } });
        const seq = (await readSequences()).find((x) => x.id === r.params.seqId);
        if (contact?.email && seq) {
          const state = await readSeqState();
          if (!state[opp.id]) {
            state[opp.id] = { seqId: seq.id, step: 0, nextYmd: ymdPlus(seq.steps[0]?.day ?? 0), email: contact.email, enrolledBy: `automation:${r.name}`, startedYmd: today };
            await writeSeqState(state);
          }
        }
      }
      await logCrmEvent({ contactId: opp.contactId, oppId: opp.id, kind: "system", body: `⚙️ Automation "${r.name}" ran (${opp.stage})`, actor: "automation" });
    }
  } catch { /* automations never break a stage move */ }
}
