import "server-only";
// 📨 Drip follow-up sequences (Jon 2026-10-29, Jonathan Duong call: automate SMS/email
// follow-up so leads don't get lost). A lead is enrolled in a sequence; each day the cron
// advances due steps. SAFE MODE (default): each step drops a ready-to-send TASK with the
// drafted message for the rep/VA to fire with one click — no un-reviewed auto-send. Flip
// DRIP_SEND=1 to auto-send instead (after reviewing the copy). Any inbound reply stops the
// drip. Enrollment is manual (the team picks who), so this is never cold mass outreach.
import { db } from "@/lib/db";

export type DripStep = { channel: "sms" | "email"; delayDays: number; sms?: string; emailSubject?: string; emailBody?: string };
// autoSend=true → Level 2: the cron SENDS the step itself (with all guardrails). Omitted/false →
// Level 1: the cron drops a ready-to-send task for a human to click. Set per-sequence (Jon 2026-11-10).
export type DripSeq = { key: string; name: string; steps: DripStep[]; autoSend?: boolean };

// Tokens: {first} {address} {rep}
export const DRIP_SEQUENCES: DripSeq[] = [
  {
    key: "seller_land", name: "Seller land follow-up (6 touches / ~30 days)",
    steps: [
      { channel: "sms", delayDays: 0, sms: "Hi {first}, it's {rep} — just following up on your land at {address}. Still open to a cash offer? Happy to send one over." },
      { channel: "email", delayDays: 3, emailSubject: "Your land at {address}", emailBody: "Hi {first},\n\nFollowing up on {address}. We buy land as-is for cash and can close on your timeline — no fees, no agents. Want me to put together a no-obligation offer?\n\nJust reply here or text me anytime." },
      { channel: "sms", delayDays: 7, sms: "{first}, still interested in selling {address}? We can usually close in a couple weeks, cash. Reply YES and I'll get you a number." },
      { channel: "email", delayDays: 14, emailSubject: "Still thinking about {address}?", emailBody: "Hi {first},\n\nNo rush — just checking back on {address}. If the timing's better now, I'd love to get you a cash offer. We handle all the paperwork and closing costs.\n\nReply anytime and we'll take it from there." },
      { channel: "sms", delayDays: 22, sms: "Hi {first}, last check-in on {address} — if you'd ever want a quick cash offer, just text me back. No pressure." },
      { channel: "email", delayDays: 30, emailSubject: "Door's always open — {address}", emailBody: "Hi {first},\n\nI'll stop reaching out for now, but if anything changes with {address}, we're always here and can move fast with a cash offer. Thanks for your time!\n\n— {rep}" },
    ],
  },
];

// 🎯 Stage-aware sequences (Jon 2026-11-04): when a seller deal lands on one of these
// stages, the matching sequence auto-arms so follow-up never falls through the cracks.
// Seller-facing, neutral copy (rep's first name only — no company name, honoring the
// outbound-anonymity rule). Same SAFE assisted-task behavior; a reply stops it.
DRIP_SEQUENCES.push(
  {
    key: "contract_sent", name: "Contract sent — chase the signature (5 touches / ~6 days)", autoSend: true,
    steps: [
      { channel: "sms", delayDays: 0, sms: "Hi {first}, just sent over the agreement for {address} — did it come through okay? Happy to walk you through any of it." },
      { channel: "email", delayDays: 1, emailSubject: "Your agreement for {address}", emailBody: "Hi {first},\n\nChecking in on the agreement for {address}. No pressure at all — I just want to make sure it reached you and answer any questions before you sign. Reply here anytime and I'll help you through it.\n\n— {rep}" },
      { channel: "sms", delayDays: 2, sms: "{first}, any questions on the agreement for {address}? Once it's signed we can keep things moving — I'm here if you need anything." },
      { channel: "email", delayDays: 4, emailSubject: "Anything I can clear up on {address}?", emailBody: "Hi {first},\n\nJust making sure the agreement for {address} didn't get buried. If anything's unclear or you'd like to go over it on a quick call, I'm glad to help. Whenever you're ready, a quick signature keeps everything moving.\n\n— {rep}" },
      { channel: "sms", delayDays: 6, sms: "Hi {first}, still here to get {address} wrapped up for you. Let me know if you need anything to feel good about signing." },
    ],
  },
  {
    key: "process_fu", name: "Process call follow-up (3 touches / ~5 days)",
    steps: [
      { channel: "sms", delayDays: 0, sms: "Hi {first}, it's {rep} — great talking about {address}. I'm pulling everything together and will have next steps for you shortly." },
      { channel: "email", delayDays: 2, emailSubject: "Next steps on {address}", emailBody: "Hi {first},\n\nThanks again for the time on {address}. I'm finalizing the details on our end and I'll follow up with where we go from here. In the meantime, reply anytime with questions.\n\n— {rep}" },
      { channel: "sms", delayDays: 5, sms: "{first}, checking back on {address}. Still want to make this easy for you — is now a good time to talk through the next step?" },
    ],
  },
  {
    key: "apt_set", name: "Appointment set — confirm + remind (2 touches / ~1 day)",
    steps: [
      { channel: "sms", delayDays: 0, sms: "Hi {first}, it's {rep} — looking forward to our call about {address}. I'll give you a ring at the time we set. Talk soon!" },
      { channel: "sms", delayDays: 1, sms: "{first}, quick reminder about our call on {address}. If you need to move it, just let me know a better time — happy to work around you." },
    ],
  },
  {
    key: "comp_offer", name: "Comp → offer — set expectations (1 touch)",
    steps: [
      { channel: "sms", delayDays: 0, sms: "Hi {first}, it's {rep} — I'm running the numbers on {address} right now and will have your cash offer ready shortly. I'll reach out the moment it's done." },
    ],
  },
  {
    key: "contract_apt", name: "Signing appointment — confirm + remind (2 touches / ~1 day)",
    steps: [
      { channel: "sms", delayDays: 0, sms: "Hi {first}, it's {rep} — all set for our signing on {address}. I'll walk you through everything so it's quick and easy. See you then!" },
      { channel: "sms", delayDays: 1, sms: "{first}, reminder about signing the agreement for {address}. If the timing's tight, tell me what works and we'll adjust." },
    ],
  },
  {
    key: "signed_nurture", name: "Signed — reassure through closing (3 touches / ~21 days)",
    steps: [
      { channel: "email", delayDays: 0, emailSubject: "What happens next with {address}", emailBody: "Hi {first},\n\nThanks for signing on {address}! Here's what's next: we'll handle the closing paperwork and keep you posted every step of the way. You don't need to do anything right now — if any questions come up, just reply here.\n\n— {rep}" },
      { channel: "sms", delayDays: 7, sms: "Hi {first}, quick update on {address} — everything's moving along on our end. I'll let you know as soon as there's a closing date. Reach out anytime!" },
      { channel: "email", delayDays: 21, emailSubject: "Checking in on {address}", emailBody: "Hi {first},\n\nJust a friendly check-in on {address}. We're working toward closing and I'll keep you updated the whole way. Thanks for trusting us with this — reply anytime if you need anything.\n\n— {rep}" },
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
    key: "ten_days_hell", name: "10 days of hell — intensive close (5 texts / 10 days)", autoSend: true,
    // ⚡ Level 2, ALL TEXT (Jon 2026-11-11): these are the hottest leads trying to reach us ASAP, so
    // it keeps texting them on its own — no email gaps while we wait on an offer.
    steps: [
      { channel: "sms", delayDays: 0, sms: "Hi {first}, it's {rep} — I really want to get {address} across the finish line for you. What's the one thing holding you back right now?" },
      { channel: "sms", delayDays: 2, sms: "{first}, checking back on {address}. If timing's the issue we can close on whatever date works for you — just say the word." },
      { channel: "sms", delayDays: 4, sms: "{first}, I don't want {address} to slip away over something small — whatever's in the way (price, timing, paperwork), tell me and let's solve it. I can move fast." },
      { channel: "sms", delayDays: 7, sms: "{first}, still ready to make {address} happen for you. A quick call might clear everything up — when are you free?" },
      { channel: "sms", delayDays: 10, sms: "{first}, last push on {address} — I really think we can get this done in a way that works for you. Reply and we'll finish strong." },
    ],
  },
  {
    key: "ghosted", name: "Ghosted / nurture — long re-engagement (3 touches / ~60 days)", autoSend: true,
    steps: [
      { channel: "sms", delayDays: 7, sms: "Hi {first}, haven't heard back on {address} — no worries at all. Still here whenever you're ready to talk numbers." },
      { channel: "email", delayDays: 30, emailSubject: "Still here for {address}", emailBody: "Hi {first},\n\nJust circling back on {address}. If the timing's better now, I'd still love to get you a fair cash offer — no fees, no agents, close on your schedule. Reply anytime.\n\n— {rep}" },
      { channel: "sms", delayDays: 60, sms: "{first}, last check-in on {address}. If anything changes, I can move fast on a cash offer. Thanks either way!" },
    ],
  },
);

export function getDripSeq(key: string): DripSeq | undefined { return DRIP_SEQUENCES.find((s) => s.key === key); }

// 🛑 Owner-operable auto-send brake (Jon 2026-11-10). Stored in a reserved Resource row (no env, no
// redeploy) so Jon can pause ALL auto-sending from the /sequences page in one click. When paused,
// Level 2 sequences fall back to assisted tasks — nothing sends itself. Level 1 is unaffected.
const DRIP_PAUSE_CAT = "__drip_autosend_pause__";
export async function isDripAutoSendPaused(): Promise<boolean> {
  const row = await db.resource.findFirst({ where: { category: DRIP_PAUSE_CAT } }).catch(() => null);
  return row?.description === "paused";
}
export async function setDripAutoSendPaused(paused: boolean): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: DRIP_PAUSE_CAT } }).catch(() => null);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: paused ? "paused" : "live" } });
  else await db.resource.create({ data: { title: "drip-autosend-pause", category: DRIP_PAUSE_CAT, url: "", description: paused ? "paused" : "live" } });
}

/** The sequences the team can start by hand (for the picker). */
export function dripSeqOptions(): Array<{ key: string; name: string }> { return DRIP_SEQUENCES.map((s) => ({ key: s.key, name: s.name })); }

// 🧭 Exact acquisition stage → sequence (Jon 2026-11-10: EVERY stage now runs a cadence, not
// just the 5 that matched a keyword). Keyed on the real ACQ_STAGES keys. `new_call_1_min` is left
// out on purpose — brand-new leads stay human speed-to-lead. Level 2 (auto-send) is flagged on the
// sequence itself (contract_sent, ghosted).
export const STAGE_SEQ: Record<string, string> = {
  "10_days_of_hell_qualify": "ten_days_hell",
  "process_call_f_u": "process_fu",
  "apt_set_process_offer_call": "apt_set",
  "comp_to_offer_24_hrs": "comp_offer",
  "comp_offer_24_hrs": "comp_offer",
  "offer_call_asap": "offer_ready",
  "verbal_offer_negotiate": "offer_negotiate",
  "contract_sent_f_u": "contract_sent",
  "contract_apt_set_sign": "contract_apt",
  "contract_signed_dispo": "signed_nurture",
  "nurture": "ghosted",
};

// 🧭 Map a pipeline stage (its key/slug) → the sequence to auto-arm. Exact ACQ keys first, then
// a normalized keyword fallback so other pipelines / renamed stages still match.
export function seqForStage(stageKey: string): string | null {
  if (STAGE_SEQ[stageKey]) return STAGE_SEQ[stageKey];
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

/** 📧 Email guard (Jon 2026-11-11): only EMAIL sellers we've already SENT AN OFFER to — by then
 *  they gave us their real email, so deliverability/consent is solid. Everything before the offer
 *  stays text-only. Comp→Offer is still PRE-offer (we're only running numbers), so it doesn't count.
 *  A drip email step for a lead that fails this is held (we advance past it; texts are unaffected). */
export function offerAlreadySent(stageKey: string): boolean {
  const s = (stageKey || "").toLowerCase().replace(/[_-]+/g, " ");
  if (/comp\s*to\s*offer|comp\s*offer/.test(s)) return false; // pre-offer: just running numbers
  return /offer\s*call|verbal\s*offer|negotiat|offer\s*made|contract|signed|escrow|closing|won/.test(s);
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

// ── Level 2 auto-send (Jon 2026-11-10) ──────────────────────────────────────────────────────
// Cron-safe senders that reuse the SAME guardrail libs as the manual send actions — owner-anonymity
// scrub, quiet hours (by area code + address), live/sticky line pick, hard anti-duplicate. They
// NEVER throw into the cron. DND is already enforced by the tag check in runDueDrips before we call
// these. A reply stops the whole drip elsewhere. Master kill switch: DRIP_AUTOSEND_OFF=1.

type DripContact = { name: string; phone: string; email: string; address: string; tags: string } | null;

/** Pick a live, SMS-capable "from" line. If the lead already knows a line, stay sticky to it; else
 *  ROTATE across our live texting lines by `rotateIdx` so a batch doesn't all come from one number
 *  (spreads carrier-spam risk — Jon 2026-11-10). */
async function pickDripSmsFrom(contactId: string, rotateIdx = 0, capped?: Set<string>): Promise<string | null> {
  let from = process.env.TELNYX_SMS_FROM || process.env.TELNYX_CALLER_ID || "";
  let sticky = false;
  try {
    const prev = await db.crmEvent.findMany({ where: { contactId, kind: "sms" }, orderBy: { at: "desc" }, take: 20, select: { meta: true } });
    for (const e of prev) { const m = e.meta as { line?: string } | null; if (m?.line) { from = m.line; sticky = true; break; } }
  } catch { /* env default */ }
  if (process.env.TELNYX_API_KEY) {
    try {
      const { partitionNumbers, pickWorkingCallerId, digits } = await import("@/lib/telnyx-numbers");
      const { live } = await partitionNumbers();
      const smsLive = live.filter((n) => n.msgProfile);
      // Prefer lines UNDER today's carrier-safe text cap; if every line is capped, fall back to all.
      const underCap = capped ? smsLive.filter((n) => !capped.has(digits(n.number))) : smsLive;
      const pool = underCap.length ? underCap : smsLive;
      const stickyCapped = sticky && !!capped && capped.has(digits(from));
      if ((!sticky || stickyCapped) && pool.length) {
        // brand-new conversation (or the sticky line is maxed) → round-robin across under-cap lines
        from = pool[((rotateIdx % pool.length) + pool.length) % pool.length].number;
      } else {
        const fromD = digits(from);
        const isLiveSms = !!fromD && smsLive.some((n) => digits(n.number) === fromD);
        if (!isLiveSms) { const pick = pool[rotateIdx % Math.max(1, pool.length)]?.number || pool[0]?.number || (await pickWorkingCallerId(from)).callerId; if (pick) from = pick; }
      }
    } catch { /* keep the configured line */ }
  }
  return from || null;
}

async function autoSendDripSms(contact: DripContact, contactId: string, oppId: string, rawText: string, rotateIdx = 0, capped?: Set<string>): Promise<{ sent: boolean; reason?: string }> {
  const { logCrmEvent } = await import("@/lib/crm");
  const { scrubOwnerIdentity } = await import("@/lib/scrub-identity");
  const text = scrubOwnerIdentity((rawText || "").trim().slice(0, 900));
  if (!text) return { sent: false, reason: "empty" };
  const d10 = (contact?.phone || "").replace(/\D/g, "").slice(-10);
  const to = d10.length === 10 && /[2-9]/.test(d10[0]) && /[2-9]/.test(d10[3]) ? `+1${d10}` : "";
  if (!to) return { sent: false, reason: "invalid number" };
  const { quietHoursWarning } = await import("@/lib/npa-tz");
  const quiet = quietHoursWarning(to, contact?.address || "");
  if (quiet) return { sent: false, reason: `quiet hours — ${quiet}` };
  const from = await pickDripSmsFrom(contactId, rotateIdx, capped);
  if (!process.env.TELNYX_API_KEY || !from) return { sent: false, reason: "no live line" };
  const sentPrefix = `➡️ Us: ${text}`.slice(0, 190);
  const dup = await db.crmEvent.findFirst({ where: { contactId, kind: "sms", at: { gte: new Date(Date.now() - 120_000) }, body: { startsWith: sentPrefix } }, select: { id: true } }).catch(() => null);
  if (dup) return { sent: false, reason: "duplicate" };
  let ok = false, err = "";
  try {
    const res = await fetch("https://api.telnyx.com/v2/messages", { method: "POST", headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to, text }) });
    ok = res.ok; if (!ok) err = (await res.text()).slice(0, 140);
  } catch (e) { err = String(e).slice(0, 140); }
  await logCrmEvent({ contactId, oppId, kind: "sms", body: `➡️ Us: ${text}${ok ? "" : ` (AUTO-SEND FAILED: ${err})`}`, meta: { dir: "outbound", line: from, auto: true }, actor: "drip" }).catch(() => {});
  return { sent: ok, reason: ok ? undefined : "telnyx error" };
}

async function autoSendDripEmail(contact: DripContact, contactId: string, oppId: string, rawSubject: string, rawBody: string, rep: string): Promise<{ sent: boolean; reason?: string }> {
  const { logCrmEvent } = await import("@/lib/crm");
  const { scrubOwnerIdentity } = await import("@/lib/scrub-identity");
  const subject = scrubOwnerIdentity((rawSubject || "Following up").trim().slice(0, 150));
  const body = scrubOwnerIdentity((rawBody || "").trim().slice(0, 4000));
  const to = (contact?.email || "").trim();
  if (!to || !body) return { sent: false, reason: "no email on file" };
  const { getChannelConfig, sendEmailTo } = await import("@/lib/notify");
  const domain = (process.env.ALERT_EMAIL_FROM ?? "info@freedom-offers.com").split("@")[1] ?? "freedom-offers.com";
  const localPart = (rep.match(/[a-z0-9]+([._-][a-z0-9]+)*/i)?.[0] || "team").toLowerCase();
  const displayName = (rep || "").replace(/[<>"\\]/g, "").trim() || "Our team";
  const cfg = { ...(await getChannelConfig()), emailFrom: `${displayName} <${localPart}@${domain}>` };
  const html = `<p>${body.replace(/\n/g, "<br>")}</p>`;
  const errOut: { msg?: string } = {};
  let ok = false;
  try { ok = await sendEmailTo([to], subject, html, cfg, process.env.CASCADE_REPLY_TO || "info@freedom-offers.com", errOut); } catch (e) { errOut.msg = String(e).slice(0, 140); }
  await logCrmEvent({ contactId, oppId, kind: "email", body: `➡️ Us: ${subject} — ${body.slice(0, 300)}${ok ? "" : ` (AUTO-SEND FAILED${errOut.msg ? `: ${errOut.msg}` : ""})`}`, meta: { dir: "outbound", auto: true }, actor: "drip" }).catch(() => {});
  return { sent: ok, reason: ok ? undefined : errOut.msg };
}

/** Run every due drip step. Level-1 sequences drop a ready-to-send task (safe); Level-2 sequences
 *  (autoSend) SEND the step themselves with full guardrails. DRIP_SEND=1 forces send on ALL;
 *  DRIP_AUTOSEND_OFF=1 is the master brake that forces everything back to assisted tasks. */
export async function runDueDrips(limit = 200): Promise<{ scanned: number; steps: number; finished: number; mode: string }> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const forceSendAll = process.env.DRIP_SEND === "1";
  const autoSendOff = process.env.DRIP_AUTOSEND_OFF === "1" || await isDripAutoSendPaused();
  // Pull opps that have a drip due (JSON path filter; fall back handled by the guard below).
  let due: Array<{ id: string; title: string; stage: string; contactId: string; assignedTo: string; formData: unknown; contact: { name: string; phone: string; email: string; address: string; tags: string } | null }> = [];
  try {
    due = await db.crmOpportunity.findMany({
      where: { archivedAt: null, formData: { path: ["__drip", "nextAt"], lte: today } as never },
      select: { id: true, title: true, stage: true, contactId: true, assignedTo: true, formData: true, contact: { select: { name: true, phone: true, email: true, address: true, tags: true } } },
      take: limit,
    });
  } catch { due = []; }

  const { logCrmEvent } = await import("@/lib/crm");
  let steps = 0, finished = 0;
  // 🌊 Throttle Level-2 auto-sends into WAVES so a big batch (e.g. 100 leads) doesn't blast from our
  // numbers at once (carrier-spam risk — Jon 2026-11-10). Cap sends PER cron run; the rest stay due
  // and drain over the next runs. SMS also rotates across our live lines (pickDripSmsFrom). With ~3
  // weekday cron runs, daily throughput ≈ DRIP_SEND_CAP × 3.
  const SEND_CAP = Math.max(1, Number(process.env.DRIP_SEND_CAP) || 40);
  let autoSent = 0, rotateIdx = 0;
  // 📵 Lines that have already hit today's carrier-safe TEXT cap — the rotation steers auto-sends
  // away from them so automation never over-texts a number into a spam flag (Jon 2026-11-11).
  let cappedLines: Set<string> | undefined;
  try {
    const { partitionNumbers, digits } = await import("@/lib/telnyx-numbers");
    const { live } = await partitionNumbers();
    const smsNums = live.filter((n) => n.msgProfile).map((n) => n.number);
    if (smsNums.length) {
      const { lineUsageToday, lineAtCap } = await import("@/lib/line-usage");
      const u = await lineUsageToday(smsNums);
      cappedLines = new Set(smsNums.map((n) => digits(n)).filter((d) => lineAtCap(u[d], "sms")));
    }
  } catch { /* no cap enforcement if number/usage lookup fails — sends still go, just unthrottled per-line */ }
  for (const o of due) {
    const state = readDrip(o.formData);
    const seq = state && getDripSeq(state.seq);
    if (!state || !seq) continue;
    const step = seq.steps[state.step];
    if (!step) { await stopDrip(o.id, "completed"); finished++; continue; }
    const tok = { first: (o.contact?.name || "there").split(" ")[0], address: o.contact?.address || o.title || "your property", rep: o.assignedTo ? o.assignedTo.split(" ")[0] : "your buyer" };
    const fd = (o.formData ?? {}) as Record<string, unknown>;

    // Decide send-vs-task up front so we can THROTTLE before consuming the step. If this run's wave
    // is already full, leave this lead due (don't advance) — it goes out on the next cron wave.
    const willAutoSend = (seq.autoSend === true || forceSendAll) && !autoSendOff;
    if (willAutoSend && autoSent >= SEND_CAP) continue;

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
    // 📧 Email guard: only email sellers we've already sent an offer to (Jon 2026-11-11). A pre-offer
    // email step is held — we advance past it so the text steps keep flowing.
    if (channel === "email" && !offerAlreadySent(o.stage)) {
      await logCrmEvent({ contactId: o.contactId, oppId: o.id, kind: "system", body: `📨 Email step ${state.step + 1} held — we only email sellers we've sent an offer to (no offer yet)`, actor: "drip" }).catch(() => {});
      continue;
    }

    const body = channel === "sms" ? fillTemplate(step.sms || "", tok) : fillTemplate(step.emailBody || "", tok);
    const subject = channel === "email" ? fillTemplate(step.emailSubject || "Following up", tok) : "";

    // Level 2 (autoSend sequence, or DRIP_SEND=1) → send it now; the brake forces assisted tasks.
    if (willAutoSend) {
      autoSent++; // consumes a wave slot (success or not) so we never hammer carriers in one run
      const r = channel === "sms"
        ? await autoSendDripSms(o.contact, o.contactId, o.id, body, rotateIdx++, cappedLines)
        : await autoSendDripEmail(o.contact, o.contactId, o.id, subject, body, tok.rep);
      if (!r.sent) {
        // Didn't send (quiet hours / no line / dup / error) → drop an assisted task so the touch
        // still happens by hand instead of vanishing.
        const title = channel === "sms"
          ? `📨 Follow-up text ${state.step + 1} → ${tok.first}: ${body.slice(0, 80)}`
          : `📨 Follow-up email ${state.step + 1} → ${tok.first}: ${subject}`;
        const existing = await db.crmTask.findFirst({ where: { contactId: o.contactId, title, createdAt: { gte: new Date(Date.now() - 14 * 86_400_000) } } }).catch(() => null);
        if (!existing) {
          const task = await db.crmTask.create({ data: { oppId: o.id, contactId: o.contactId, title: `${title} (auto-send skipped: ${r.reason ?? "unknown"})`.slice(0, 180), due: today, assignedTo: o.assignedTo, createdBy: "drip" } }).catch(() => null);
          if (task) { const { writeTaskNote } = await import("@/lib/task-notes"); await writeTaskNote(task.id, channel === "email" ? `Subject: ${subject}\n\n${body}` : body).catch(() => {}); }
        }
      }
    } else {
      // SAFE: drop a ready-to-send task for the rep/VA.
      const title = channel === "sms"
        ? `📨 Follow-up text ${state.step + 1} → ${tok.first}: ${body.slice(0, 80)}`
        : `📨 Follow-up email ${state.step + 1} → ${tok.first}: ${subject}`;
      // Dedup per CONTACT (not per opp) and regardless of done status within 14 days, so a
      // contact with multiple leads — or a re-run after the task was completed — doesn't pile
      // up identical follow-up tasks (Jon 2026-11-05: "why is this showing three times").
      const existing = await db.crmTask.findFirst({ where: { contactId: o.contactId, title, createdAt: { gte: new Date(Date.now() - 14 * 86_400_000) } } }).catch(() => null);
      if (!existing) {
        const task = await db.crmTask.create({ data: { oppId: o.id, contactId: o.contactId, title, due: today, assignedTo: o.assignedTo, createdBy: "drip" } }).catch(() => null);
        if (task) { const { writeTaskNote } = await import("@/lib/task-notes"); await writeTaskNote(task.id, channel === "email" ? `Subject: ${subject}\n\n${body}` : body).catch(() => {}); }
      }
    }
    steps++;
  }
  return { scanned: due.length, steps, finished, mode: autoSendOff ? "assisted-task (brake on)" : "per-sequence (L2 auto-send + L1 tasks)" };
}
