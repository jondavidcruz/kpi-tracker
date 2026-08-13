// Turns raw Twilio/Telnyx alarm payloads into plain English. Twilio Debugger
// alerts arrive URL-encoded with a numeric ErrorCode; we map the common codes to
// a one-line meaning + the fix, and fall back to a decoded/cleaned message.

export const TELCO_ERRORS: Record<string, { short: string; action: string }> = {
  // ── Messaging / SMS deliverability ──
  "30003": { short: "SMS undelivered — handset unreachable or off", action: "Retry later; if it repeats the number may be bad." },
  "30004": { short: "SMS blocked by the carrier or opt-out", action: "Confirm the recipient hasn't replied STOP." },
  "30005": { short: "SMS to an unknown/retired number", action: "Scrub the number from the list." },
  "30006": { short: "SMS sent to a landline / unreachable carrier", action: "Filter landlines before texting." },
  "30007": { short: "SMS filtered by the carrier as spam", action: "Register/verify A2P 10DLC and clean up message content + links." },
  "30008": { short: "SMS failed — unknown carrier error", action: "Monitor volume; if widespread, check 10DLC registration." },
  "30034": { short: "Texting from an UNREGISTERED A2P 10DLC number", action: "Register the brand + campaign in 10DLC now — carriers are filtering these." },
  "21211": { short: "Invalid 'To' phone number", action: "Validate numbers before sending." },
  "21610": { short: "Recipient previously opted out (STOP)", action: "Do not re-text — they must text START to opt back in." },
  // ── Voice / dialer ──
  "13224": { short: "Invalid phone number dialed", action: "Clean the dialer list — bad number format." },
  "32014": { short: "Call dropped — RTP timeout (no audio)", action: "Network/codec issue; check the dialer's connection quality." },
  "31003": { short: "Call connection timed out", action: "Carrier/network issue; monitor if repeated." },
  // ── Webhook / app errors (your CRM's endpoints) ──
  "11200": { short: "Twilio couldn't reach your webhook (HTTP retrieval failure)", action: "Your CRM's callback URL errored or was slow — check it's up." },
  "15003": { short: "Your app returned HTTP 503 to Twilio", action: "The CRM webhook is overloaded/down — check the dialer backend." },
  "12200": { short: "Invalid call XML (TwiML schema warning)", action: "A call-flow/webhook response has a malformed attribute — usually harmless, but worth a look in the CRM config." },
  "11750": { short: "TwiML response too large", action: "Your webhook returned an oversized response." },
};

/** Best-effort human summary of a raw alarm. Returns a clean meaning + optional fix. */
export function humanizeAlarm(code: string | undefined, rawText: string): { meaning: string; action?: string } {
  if (code && TELCO_ERRORS[code]) return { meaning: TELCO_ERRORS[code].short, action: TELCO_ERRORS[code].action };

  // Unknown code — decode and strip the noise so it's at least readable.
  let t = rawText || "";
  try { t = decodeURIComponent(t.replace(/\+/g, " ")); } catch { t = t.replace(/\+/g, " "); }
  t = t.replace(/https?:\/\/\S+/g, "").trim();
  // Prefer an embedded human message if present.
  const msg = t.match(/(?:parserMessage|Msg|message|reason)=([^&]+)/i)?.[1];
  let clean = (msg ?? t).replace(/&?[A-Za-z]\w*=/g, " ").replace(/\s+/g, " ").trim();
  clean = clean.replace(/^[-–:\s]+/, "");
  return { meaning: clean.slice(0, 140) || (code ? `Provider error ${code}` : "Provider alert") };
}
