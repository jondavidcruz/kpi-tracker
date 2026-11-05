import { db } from "@/lib/db";

// 🚫 DNC engine (Jon 2026-10-08): any "STOP"/hostile reply moves the lead to
// the dedicated DNC pipeline + tags the contact so nobody ever texts them
// again. Archive-never-delete: the record stays, in its own pen.
export const DNC_PIPELINE = "🚫 DNC List";
export const DNC_REGEX = /\b(stop|stopall|unsubscribe|opt ?out|remove me|do not (text|call|contact)|don'?t (text|call|contact)|take me off|f+u*c+k+|fuck|bitch|a[s$]{2}hole|screw you|piss off|sue you|lawyer|harassment|harassing)\b/i;

/** The DNC pipeline NAME to use — recognizes ANY pipeline the user already has whose name
 *  contains "DNC" (so a renamed/customized one counts), and only creates the default when
 *  none exists. Fixes Jon 2026-11-05: a 2nd "DNC List" kept regenerating because the check
 *  required an exact "🚫 DNC List" match and didn't see his customized one. */
export async function resolveDncPipeline(): Promise<string> {
  const row = await db.resource.findFirst({ where: { category: "__crm_pipelines__" } });
  if (!row?.description) return DNC_PIPELINE;
  try {
    const defs = JSON.parse(row.description) as Array<{ name: string; stages: Array<{ key: string; label: string }> }>;
    const existing = defs.find((d) => /dnc/i.test(d.name));
    if (existing) return existing.name; // already have one (any name) — never duplicate it
    defs.push({ name: DNC_PIPELINE, stages: [{ key: "dnc", label: "🚫 DNC / STOP" }, { key: "hostile", label: "🤬 Hostile" }] });
    await db.resource.update({ where: { id: row.id }, data: { description: JSON.stringify(defs) } });
    return DNC_PIPELINE;
  } catch { return DNC_PIPELINE; }
}

export async function ensureDncPipeline(): Promise<void> { await resolveDncPipeline(); }

/** Handle a STOP/opt-out. For a lead with a LIVE DEAL in progress (a dispo deal pipeline),
 *  this only SUPPRESSES TEXTING (dnd_sms) and leaves the lead in place — Jon 2026-10-27:
 *  "they're still interested, they just didn't want the text, so we'll still process it."
 *  A cold/unassigned lead is tagged full DNC and parked in the DNC pipeline as before. */
export async function dncContact(contactId: string, why: string): Promise<void> {
  const { logCrmEvent } = await import("@/lib/crm");
  const { isDispoDealPipeline } = await import("@/lib/dispo-buyers");
  const c = await db.crmContact.findUnique({ where: { id: contactId }, select: { tags: true } });
  if (!c) return;
  const opps = await db.crmOpportunity.findMany({ where: { contactId, archivedAt: null }, select: { id: true, pipeline: true } });
  // In an active deal pipeline = a live, interested lead. STOP = stop TEXTING, not "dead".
  const hasLiveDeal = opps.some((o) => isDispoDealPipeline(o.pipeline));
  if (hasLiveDeal) {
    if (!/\bdnd_sms\b|\bdnc\b/i.test(c.tags)) await db.crmContact.update({ where: { id: contactId }, data: { tags: c.tags ? `${c.tags},dnd_sms` : "dnd_sms" } });
    await logCrmEvent({ contactId, oppId: opps[0]?.id ?? "", kind: "system", body: `🔕 No-text set: ${why} — texts suppressed, but this lead has a live deal so it STAYS in its pipeline (still workable by call). Not moved to DNC.`, actor: "dnc-guard" }).catch(() => {});
    return;
  }
  // Cold / no live deal → full DNC + park in the DNC pipeline (routes to the EXISTING one).
  const dncName = await resolveDncPipeline();
  if (!/\bdnc\b/i.test(c.tags)) await db.crmContact.update({ where: { id: contactId }, data: { tags: c.tags ? `${c.tags},dnc` : "dnc" } });
  for (const o of opps) await db.crmOpportunity.update({ where: { id: o.id }, data: { pipeline: dncName, stage: "dnc" } });
  await logCrmEvent({ contactId, oppId: opps[0]?.id ?? "", kind: "system", body: `🚫 AUTO-DNC: ${why} — tagged dnc + moved to the DNC pipeline. Do not text or call.`, actor: "dnc-guard" }).catch(() => {});
}
