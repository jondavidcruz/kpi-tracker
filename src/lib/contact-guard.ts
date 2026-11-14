// 🚫 ONE source of truth for "may we send this contact an AUTOMATED message?" (Jon 2026-11-13:
// "ensure War Room + Direct REI never contact people we opted out, and NEVER re-contact anyone who
// threatened to sue us"). Every automated send path — drips, appointment auto-messages, any future
// cascade to a CRM contact — checks this FIRST, so a lead we've opted out, or flagged for
// litigation, is never messaged again by a machine. Manual, human-initiated sends are intentionally
// NOT gated here (a rep may deliberately reply to a litigator under a manager's guidance); this guard
// is for automations only.
//
// Tag meanings (on CrmContact.tags):
//   • dnc         — full opt-out (STOP / hostile). Never contact on any channel.
//   • dnd_all     — do-not-disturb, all channels.
//   • legal-watch — litigator / threatened legal action / fished for our info. Never AUTO-contact;
//                   a human decides every touch (protects us from a TCPA/DNC paper trail).
//   • dnd_sms     — no texting (but a live deal may still be worked by call/human).
//   • dnd_email   — no emailing.

export type SendChannel = "sms" | "email";
export type Suppression = { blocked: boolean; reason: string };

/** Why (if at all) an AUTOMATED message to this contact must be suppressed on `channel`. */
export function suppressionFor(tags: string | null | undefined, channel: SendChannel): Suppression {
  const t = tags || "";
  if (/\blegal-watch\b/i.test(t)) return { blocked: true, reason: "legal-watch (litigator — no automated contact)" };
  if (/\bdnc\b/i.test(t)) return { blocked: true, reason: "DNC (opted out)" };
  if (/\bdnd_all\b/i.test(t)) return { blocked: true, reason: "do-not-disturb (all channels)" };
  if (channel === "sms" && /\bdnd_sms\b/i.test(t)) return { blocked: true, reason: "no-text (dnd_sms)" };
  if (channel === "email" && /\bdnd_email\b/i.test(t)) return { blocked: true, reason: "no-email (dnd_email)" };
  return { blocked: false, reason: "" };
}

/** True if an AUTOMATED message on `channel` must NOT be sent to this contact. */
export function isSuppressed(tags: string | null | undefined, channel: SendChannel): boolean {
  return suppressionFor(tags, channel).blocked;
}

// ⚖️ A HARD litigation threat (an explicit intent to sue / legal action / cease-and-desist / TCPA /
// attorney / harassment claim) — the subset of legal signals we AUTO-suppress texting on, even when
// the broader "who are you / what LLC" info-fishing questions do not (those can be a normal question
// from an established offer lead, so a human decides). Conservative on purpose.
export const HARD_THREAT_REGEX = /\b(sue|sued|suing|law\s?suit|litigat\w*|cease\s*(and|&)?\s*desist|\btcpa\b|attorney|lawyer|legal\s*action|take\s*legal|file\s*(a\s*)?(complaint|report|suit|claim)|attorney\s*general|statutory\s*damages|harass(ment|ing|ed)?)\b/i;

/** Classify why a message tripped the litigator watch, for the legal-defense record. */
export function threatType(text: string): "litigation-threat" | "info-fishing" {
  return HARD_THREAT_REGEX.test(text || "") ? "litigation-threat" : "info-fishing";
}
