// SMS consent language for the public private-offer form. MUST match the
// message-flow copy registered on the Telnyx 10DLC campaign word-for-word
// (campaign 4b30019f…, registered 2026-08-03) — carriers compare the live
// page to the registration. Bump CONSENT_VERSION whenever wording changes
// (it is stored on every lead as proof of what they agreed to).
export const CONSENT_VERSION = "2026-10-07";
export const CONSENT_TEXT =
  "I agree to receive text messages from Freedom Offers LLC about my property inquiry, including offer updates, scheduling, and follow-up communication. Msg frequency varies. Msg and data rates may apply. Reply STOP to opt out, HELP for help.";
export const CONSENT_FOOTNOTE =
  "The checkbox is not pre-checked and checking it is not a condition of receiving an offer. We never use purchased or third-party lists.";
