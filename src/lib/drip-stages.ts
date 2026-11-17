// 🧭 Stage → drip-sequence resolver (client-safe, no server imports) so BOTH the server
// drip engine and the CRM board can map a pipeline stage to the sequence that runs in it.
// Split out of drip.ts (Jon 2026-11-17) so the kanban cheat sheet can resolve the live
// sequence per stage without pulling db/telnyx into the client bundle. drip.ts re-exports
// these, so existing `@/lib/drip` imports keep working — one source of truth.

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
  "nurture": "cold_nurture",
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
  if (/ghost|cold|unrespons|no\s*response/.test(s)) return "cold_nurture";
  return null;
}
