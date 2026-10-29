// 🤖 Master Workflow (Jonathan Duong call, Jon 2026-10-28): auto-classify inbound
// SMS/email replies so the VA only works QUALIFIED leads and the rest auto-reschedule
// instead of getting lost. Pure + keyword-based (no AI cost); the inbound handlers
// keep their AI STOP/DECLINE screen as a fallback.
export type ReplyIntent = "stop" | "not_interested" | "working_with_realtor" | "qualified" | "neutral";

// "I'm working with a realtor / already listed" → longer snooze (their listing may expire).
const REALTOR = /\b(realtor|real\s*estate\s*agent|listing\s*agent|already\s*listed|listed\s*(it|with|already|on)|on\s*the\s*market|working\s*with\s*(a|an|my|our)?\s*(agent|realtor|broker)|have\s*(a|an|my|our)?\s*(agent|realtor|broker)|my\s*agent|our\s*agent|using\s*(a|an)?\s*(agent|realtor))\b/i;
// Clear buying/selling interest or a question → qualified, reaches the VA now.
const QUALIFIED = /\b(how\s*much|what('?s| is| are)\s*(your|the|you)|price|pricing|offer|cash|interested|when\s*can|call\s*me|give\s*me\s*a\s*call|text\s*me|send\s*(me|the|over)|more\s*info|tell\s*me\s*more|make\s*an\s*offer|i'?m\s*in|let'?s\s*talk|yes\b|sure\b|okay\b|ok\b|details|where\s*is|which\s*(lot|property|one))\b/i;

/** Keyword intent for "realtor" or "qualified". Returns null to defer to the
 *  handler's STOP/DECLINE (AI) screen for everything else. */
export function replyIntentKeywords(text: string): "working_with_realtor" | "qualified" | null {
  const t = String(text || "");
  if (REALTOR.test(t)) return "working_with_realtor";
  if (QUALIFIED.test(t)) return "qualified";
  return null;
}

/** Days until the next auto follow-up for a snoozed intent (0 = no snooze / work now). */
export function followUpDaysFor(intent: ReplyIntent): number {
  switch (intent) {
    case "not_interested": return 30;       // circle back in a month
    case "working_with_realtor": return 50; // listing may expire — longer gap
    default: return 0;                       // qualified / neutral → VA works it now
  }
}

// ⚙️ Owner-editable config (Jon 2026-10-29: "let me tune the keywords + timings myself").
// Stored in Resource __master_workflow__; falls back to these defaults (which mirror the
// built-in regexes above). Keep it keyword-based so there's no AI cost on every inbound text.
export type WorkflowConfig = {
  realtorKeywords: string[];
  qualifiedKeywords: string[];
  notInterestedDays: number;
  realtorDays: number;
};

export const DEFAULT_WORKFLOW: WorkflowConfig = {
  realtorKeywords: ["realtor", "real estate agent", "listing agent", "already listed", "on the market", "working with an agent", "working with a realtor", "my agent", "our agent", "have an agent", "using an agent", "broker"],
  qualifiedKeywords: ["how much", "what's your", "price", "pricing", "offer", "cash", "interested", "call me", "text me", "send me", "more info", "tell me more", "make an offer", "let's talk", "yes", "sure", "okay", "details", "where is", "which lot", "which property"],
  notInterestedDays: 30,
  realtorDays: 50,
};

/** Build a case-insensitive phrase matcher from a keyword list (spaces = flexible whitespace). */
export function keywordRegex(words: string[]): RegExp | null {
  const parts = words
    .map((w) => String(w).trim())
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
  return parts.length ? new RegExp(`(^|\\b)(${parts.join("|")})(\\b|$)`, "i") : null;
}

/** Config-driven version of replyIntentKeywords — uses the owner's edited keyword lists. */
export function replyIntentWith(text: string, cfg: WorkflowConfig): "working_with_realtor" | "qualified" | null {
  const t = String(text || "");
  const r = keywordRegex(cfg.realtorKeywords); if (r && r.test(t)) return "working_with_realtor";
  const q = keywordRegex(cfg.qualifiedKeywords); if (q && q.test(t)) return "qualified";
  return null;
}

/** Config-driven follow-up days (0 = work now). */
export function followUpDaysWith(intent: ReplyIntent, cfg: WorkflowConfig): number {
  switch (intent) {
    case "not_interested": return cfg.notInterestedDays;
    case "working_with_realtor": return cfg.realtorDays;
    default: return 0;
  }
}

export function intentTag(intent: ReplyIntent): string {
  switch (intent) {
    case "not_interested": return "not-interested";
    case "working_with_realtor": return "working-with-realtor";
    case "qualified": return "qualified";
    default: return "";
  }
}

/** YYYY-MM-DD that is `days` from today (org work can read this as the next follow-up). */
export function followUpDate(days: number, tz = "America/Los_Angeles"): string {
  const d = new Date(Date.now() + days * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}
