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

// 🎯 Stage-aware sequences (Jon 2026-11-04): when a seller deal lands on one of these
// stages, the matching sequence auto-arms so follow-up never falls through the cracks.
// Seller-facing, neutral copy (rep's first name only — no company name, honoring the
// outbound-anonymity rule). Same SAFE assisted-task behavior; a reply stops it.
DRIP_SEQUENCES.push(
  {
    key: "contract_sent", name: "Contract sent — chase the signature (3 touches / ~5 days)",
    steps: [
      { channel: "sms", delayDays: 0, sms: "Hi {first}, just sent over the agreement for {address} — did it come through okay? Happy to walk you through any of it." },
      { channel: "email", delayDays: 2, emailSubject: "Your agreement for {address}", emailBody: "Hi {first},\n\nChecking in on the agreement for {address}. No pressure at all — I just want to make sure it reached you and answer any questions before you sign. Reply here anytime and I'll help you through it.\n\n— {rep}" },
      { channel: "sms", delayDays: 5, sms: "{first}, any questions on the agreement for {address}? Once it's signed we can keep things moving. I'm here if you need anything." },
    ],
  },
  {
    key: "offer_negotiate", name: "Offer made / negotiating — keep it warm (3 touches / ~6 days)",
    steps: [
      { channel: "sms", delayDays: 0, sms: "Hi {first}, following up on the offer for {address}. Is the number close for you, or is there something we can adjust to make it work?" },
      { channel: "email", delayDays: 3, emailSubject: "Can we make {address} work?", emailBody: "Hi {first},\n\nI'd like to find a number that works for both of us on {address}. If the offer isn't quite there, tell me what you had in mind and I'll see what I can do — happy to hop on a quick call too.\n\n— {rep}" },
      { channel: "sms", delayDays: 6, sms: "{first}, still happy to work with you on {address}. Just let me know what number gets us there and I'll do my best." },
    ],
  },
  {
    key: "offer_ready", name: "Offer ready — get it in front of them (2 touches / ~2 days)",
    steps: [
      { channel: "sms", delayDays: 0, sms: "Hi {first}, good news — I've got a cash offer ready for {address}. When's a good time to walk you through it?" },
      { channel: "sms", delayDays: 2, sms: "{first}, still have that offer ready for {address} whenever you are — just reply and I'll send the details over." },
    ],
  },
  {
    key: "ten_days_hell", name: "10 days of hell — intensive close (5 touches / 10 days)",
    steps: [
      { channel: "sms", delayDays: 0, sms: "Hi {first}, it's {rep} — I really want to get {address} across the finish line for you. What's the one thing holding you back right now?" },
      { channel: "sms", delayDays: 2, sms: "{first}, checking back on {address}. If timing's the issue we can close on whatever date works for you — just say the word." },
      { channel: "email", delayDays: 4, emailSubject: "Let's get {address} done", emailBody: "Hi {first},\n\nI don't want {address} to slip away over something small. Whatever's in the way — price, timing, paperwork — tell me and let's solve it together. I can move fast on my end.\n\n— {rep}" },
      { channel: "sms", delayDays: 7, sms: "{first}, still ready to make {address} happen for you. A quick call might clear everything up — when are you free?" },
      { channel: "email", delayDays: 10, emailSubject: "Last push on {address}", emailBody: "Hi {first},\n\nI'll ease off after this — but I genuinely believe we can get {address} done in a way that works for you. If you're open to it, reply and we'll finish strong.\n\n— {rep}" },
    ],
  },
  {
    key: "ghosted", name: "Ghosted — long re-engagement (3 touches / ~60 days)",
    steps: [
      { channel: "sms", delayDays: 7, sms: "Hi {first}, haven't heard back on {address} — no worries at all. Still here whenever you're ready to talk numbers." },
      { channel: "email", delayDays: 30, emailSubject: "Still here for {address}", emailBody: "Hi {first},\n\nJust circling back on {address}. If the timing's better now, I'd still love to get you a fair cash offer — no fees, no agents, close on your schedule. Reply anytime.\n\n— {rep}" },
      { channel: "sms", delayDays: 60, sms: "{first}, last check-in on {address}. If anything changes, I can move fast on a cash offer. Thanks either way!" },
    ],
  },
);

export function getDripSeq(key: string): DripSeq | undefined { return DRIP_SEQUENCES.find((s) => s.key === key); }

/** The sequences the team can start by hand (for the picker). */
export function dripSeqOptions(): Array<{ key: string; name: string }> { return DRIP_SEQUENCES.map((s) => ({ key: s.key, name: s.name })); }

// 🧭 Map a pipeline stage (its key/slug) → the sequence to auto-arm. Matched on the
// normalized stage text so it works across pipelines with slightly different stage names.
export function seqForStage(stageKey: string): string | null {
  const s = stageKey.toLowerCase().replace(/[_-]+/g, " ");
  if (/contract\s*sent|sent\s*contract|agreement\s*sent|out\s*for\s*sign/.test(s)) return "contract_sent";
  if (/offer\s*ready|ready\s*to\s*present|present\s*offer|offer\s*to\s*present/.test(s)) return "offer_ready";
  if (/negotiat|counter|offer\s*made|making\s*offer/.test(s)) return "offer_negotiate";
  if (/10\s*day|ten\s*day|days?\s*of\s*hell|\bhell\b/.test(s)) return "ten_days_hell";
  if (/ghost|cold|unrespons|no\s*response/.test(s)) return "ghosted";
  return null;
}

/** Terminal stages where any auto-armed follow-up should stop. */
export function isTerminalStage(stageKey: string): boolean {
  return /\b(won|signed|assigned|closed|dead|lost|rejected|not\s*interested|disqualified)\b/i.test(stageKey.replace(/[_-]+/g, " "));
}

export type DripState = { seq: string; step: number; nextAt: string; startedBy: string; startedAt: string; stageArmed?: boolean };
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

/** Enroll a lead (sets the first step due today). Manual — the team chooses who.
 *  `stageArmed` marks a sequence that a stage change started automatically (so a later
 *  stage change can replace it, but a manually-started one is never clobbered). */
export async function enrollDrip(oppId: string, seqKey: string, by: string, stageArmed = false): Promise<boolean> {
  const seq = getDripSeq(seqKey);
  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { formData: true } });
  if (!seq || !opp) return false;
  const fd = (opp.formData ?? {}) as Record<string, unknown>;
  const state: DripState = { seq: seqKey, step: 0, nextAt: ymdAddDays(seq.steps[0]?.delayDays ?? 0), startedBy: by, startedAt: new Date().toISOString(), ...(stageArmed ? { stageArmed: true } : {}) };
  await db.crmOpportunity.update({ where: { id: oppId }, data: { formData: { ...fd, __drip: state } as never } });
  return true;
}

/** 🎯 Auto-arm the stage-matched sequence when a SELLER deal changes stage (Jon 2026-11-04).
 *  Never clobbers a manually-started drip; replaces a prior stage-armed one; stops at a
 *  terminal stage. Safe (assisted tasks), reply-stops, never blocks the move. */
export async function autoArmStageDrip(oppId: string, stageKey: string, by: string, pipeline?: string | null): Promise<void> {
  // Seller pipelines only — don't follow-up-drip buyers / developers / agents.
  if (pipeline && /developer|agent|buyer|dispo/i.test(pipeline)) return;
  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { formData: true } });
  if (!opp) return;
  const cur = readDrip(opp.formData) as (DripState & { stageArmed?: boolean }) | null;
  const seqKey = seqForStage(stageKey);
  if (!seqKey) {
    if (cur?.stageArmed && isTerminalStage(stageKey)) await stopDrip(oppId, `stage ${stageKey}`);
    return;
  }
  if (cur && !cur.stageArmed) return;                 // manual drip running — leave it
  if (cur && cur.stageArmed && cur.seq === seqKey) return; // already on this sequence
  await enrollDrip(oppId, seqKey, by, true);
  const { logCrmEvent } = await import("@/lib/crm");
  const seq = getDripSeq(seqKey);
  await logCrmEvent({ contactId: (await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { contactId: true } }))?.contactId ?? "", oppId, kind: "system", body: `📨 Follow-up sequence armed — ${seq?.name ?? seqKey} (stage: ${stageKey})`, actor: "drip" }).catch(() => {});
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
