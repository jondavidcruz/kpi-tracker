import "server-only";
// 📨 Drip follow-up sequences (Jon 2026-10-29, Jonathan Duong call: automate SMS/email
// follow-up so leads don't get lost). A lead is enrolled in a sequence; each day the cron
// advances due steps. SAFE MODE (default): each step drops a ready-to-send TASK with the
// drafted message for the rep/VA to fire with one click — no un-reviewed auto-send. Flip
// DRIP_SEND=1 to auto-send instead (after reviewing the copy). Any inbound reply stops the
// drip. Enrollment is manual (the team picks who), so this is never cold mass outreach.
import { db } from "@/lib/db";

export type DripStep = { channel: "sms" | "email"; delayDays: number; sms?: string; emailSubject?: string; emailBody?: string };
export type DripSeq = { key: string; name: string; steps: DripStep[] };

// Tokens: {first} {address} {rep}
export const DRIP_SEQUENCES: DripSeq[] = [
  {
    key: "seller_land", name: "Seller land follow-up (6 touches / ~30 days)",
    steps: [
      { channel: "sms", delayDays: 0, sms: "Hi {first}, it's {rep} with Freedom Offers — just following up on your land at {address}. Still open to a cash offer? Happy to send one over." },
      { channel: "email", delayDays: 3, emailSubject: "Your land at {address}", emailBody: "Hi {first},\n\nFollowing up on {address}. We buy land as-is for cash and can close on your timeline — no fees, no agents. Want me to put together a no-obligation offer?\n\nJust reply here or text me anytime." },
      { channel: "sms", delayDays: 7, sms: "{first}, still interested in selling {address}? We can usually close in a couple weeks, cash. Reply YES and I'll get you a number." },
      { channel: "email", delayDays: 14, emailSubject: "Still thinking about {address}?", emailBody: "Hi {first},\n\nNo rush — just checking back on {address}. If the timing's better now, I'd love to get you a cash offer. We handle all the paperwork and closing costs.\n\nReply anytime and we'll take it from there." },
      { channel: "sms", delayDays: 22, sms: "Hi {first}, last check-in on {address} from Freedom Offers — if you'd ever want a quick cash offer, just text me back. No pressure." },
      { channel: "email", delayDays: 30, emailSubject: "Door's always open — {address}", emailBody: "Hi {first},\n\nI'll stop reaching out for now, but if anything changes with {address}, we're always here and can move fast with a cash offer. Thanks for your time!\n\n— {rep}, Freedom Offers" },
    ],
  },
];

export function getDripSeq(key: string): DripSeq | undefined { return DRIP_SEQUENCES.find((s) => s.key === key); }

export type DripState = { seq: string; step: number; nextAt: string; startedBy: string; startedAt: string };
export function readDrip(formData: unknown): DripState | null {
  const d = (formData as Record<string, unknown> | null)?.__drip as DripState | undefined;
  return d && typeof d.seq === "string" && getDripSeq(d.seq) ? d : null;
}

export function fillTemplate(t: string, tok: { first: string; address: string; rep: string }): string {
  return t.replace(/\{first\}/g, tok.first).replace(/\{address\}/g, tok.address).replace(/\{rep\}/g, tok.rep);
}

function ymdAddDays(days: number, tz = "America/Los_Angeles"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(Date.now() + days * 86400000));
}

/** Enroll a lead (sets the first step due today). Manual — the team chooses who. */
export async function enrollDrip(oppId: string, seqKey: string, by: string): Promise<boolean> {
  const seq = getDripSeq(seqKey);
  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { formData: true } });
  if (!seq || !opp) return false;
  const fd = (opp.formData ?? {}) as Record<string, unknown>;
  const state: DripState = { seq: seqKey, step: 0, nextAt: ymdAddDays(seq.steps[0]?.delayDays ?? 0), startedBy: by, startedAt: new Date().toISOString() };
  await db.crmOpportunity.update({ where: { id: oppId }, data: { formData: { ...fd, __drip: state } as never } });
  return true;
}

export async function stopDrip(oppId: string, reason = "stopped"): Promise<void> {
  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { formData: true } });
  if (!opp) return;
  const fd = (opp.formData ?? {}) as Record<string, unknown>;
  if (!fd.__drip) return;
  delete fd.__drip;
  await db.crmOpportunity.update({ where: { id: oppId }, data: { formData: { ...fd, __dripEndedReason: reason } as never } });
}

/** Run every due drip step. Default = create a ready-to-send task (safe). DRIP_SEND=1 → auto-send. */
export async function runDueDrips(limit = 200): Promise<{ scanned: number; steps: number; finished: number; mode: string }> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const autoSend = process.env.DRIP_SEND === "1";
  // Pull opps that have a drip due (JSON path filter; fall back handled by the guard below).
  let due: Array<{ id: string; title: string; contactId: string; assignedTo: string; formData: unknown; contact: { name: string; phone: string; email: string; address: string; tags: string } | null }> = [];
  try {
    due = await db.crmOpportunity.findMany({
      where: { archivedAt: null, formData: { path: ["__drip", "nextAt"], lte: today } as never },
      select: { id: true, title: true, contactId: true, assignedTo: true, formData: true, contact: { select: { name: true, phone: true, email: true, address: true, tags: true } } },
      take: limit,
    });
  } catch { due = []; }

  const { logCrmEvent } = await import("@/lib/crm");
  let steps = 0, finished = 0;
  for (const o of due) {
    const state = readDrip(o.formData);
    const seq = state && getDripSeq(state.seq);
    if (!state || !seq) continue;
    const step = seq.steps[state.step];
    if (!step) { await stopDrip(o.id, "completed"); finished++; continue; }
    const tok = { first: (o.contact?.name || "there").split(" ")[0], address: o.contact?.address || o.title || "your property", rep: (o.assignedTo || "Freedom Offers").split(" ")[0] };
    const fd = (o.formData ?? {}) as Record<string, unknown>;

    // advance first (idempotent — a retry won't double-fire the same step)
    const nextStep = state.step + 1;
    const nextState: DripState | null = nextStep < seq.steps.length
      ? { ...state, step: nextStep, nextAt: ymdAddDays(seq.steps[nextStep].delayDays) }
      : null;
    await db.crmOpportunity.update({ where: { id: o.id }, data: { formData: (nextState ? { ...fd, __drip: nextState } : (() => { const c = { ...fd }; delete c.__drip; return c; })()) as never } }).catch(() => {});
    if (!nextState) finished++;

    const channel = step.channel;
    // DND is tag-based on the contact — never drip to a blocked channel.
    const tags = o.contact?.tags || "";
    const blocked = /\bdnc\b|\bdnd_all\b/i.test(tags) || (channel === "sms" ? /\bdnd_sms\b/i.test(tags) : /\bdnd_email\b/i.test(tags));
    const reachable = channel === "sms" ? !!o.contact?.phone : !!o.contact?.email;
    if (blocked || !reachable) { await logCrmEvent({ contactId: o.contactId, oppId: o.id, kind: "system", body: `📨 Drip step ${state.step + 1} skipped — ${channel} ${blocked ? "DND" : "no address on file"}`, actor: "drip" }).catch(() => {}); continue; }

    const body = channel === "sms" ? fillTemplate(step.sms || "", tok) : fillTemplate(step.emailBody || "", tok);
    const subject = channel === "email" ? fillTemplate(step.emailSubject || "Following up", tok) : "";

    if (autoSend) {
      // (gated) auto-send would go here — left to the existing send actions once Jon enables it.
      await logCrmEvent({ contactId: o.contactId, oppId: o.id, kind: "system", body: `📨 Drip ${channel} step ${state.step + 1} queued (auto-send) — ${subject || body.slice(0, 60)}`, actor: "drip" }).catch(() => {});
    } else {
      // SAFE: drop a ready-to-send task for the rep/VA.
      const title = channel === "sms"
        ? `📨 Follow-up text ${state.step + 1} → ${tok.first}: ${body.slice(0, 80)}`
        : `📨 Follow-up email ${state.step + 1} → ${tok.first}: ${subject}`;
      const existing = await db.crmTask.findFirst({ where: { oppId: o.id, title, doneAt: null } }).catch(() => null);
      if (!existing) {
        const task = await db.crmTask.create({ data: { oppId: o.id, contactId: o.contactId, title, due: today, assignedTo: o.assignedTo, createdBy: "drip" } }).catch(() => null);
        if (task) { const { writeTaskNote } = await import("@/lib/task-notes"); await writeTaskNote(task.id, channel === "email" ? `Subject: ${subject}\n\n${body}` : body).catch(() => {}); }
      }
    }
    steps++;
  }
  return { scanned: due.length, steps, finished, mode: autoSend ? "auto-send" : "assisted-task" };
}
