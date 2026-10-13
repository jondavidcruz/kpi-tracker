// 🧭 Stage explanations (Jon 2026-10-13): hovering a pipeline stage should say
// what that stage MEANS and what the rep does there — like the proposed-stages
// panel. Matched by keyword against the stage label so it works across every
// pipeline (acq / dispo / cold / custom) without per-stage config.
type Help = { title: string; desc: string };

const RULES: { re: RegExp; help: Help }[] = [
  { re: /10 ?days? of hell|qualif/i, help: { title: "10 Days of Hell — Qualify", desc: "Brand-new lead in the first hard-follow-up window. Hit them fast and often to qualify motivation, timeline, and price. Move forward the moment they engage." } },
  { re: /\bnew\b|new lead|<\s*1 ?min/i, help: { title: "New", desc: "Just entered the system — never worked. Call within 1 minute (speed-to-lead) before it goes cold." } },
  { re: /nurtur/i, help: { title: "Nurture", desc: "Not ready now but not dead — motivation or circumstances may change. Light automated touches + quarterly check-ins keep it warm until it moves." } },
  { re: /process call/i, help: { title: "Process Call F/U", desc: "You've had the first real conversation; now follow up to gather the info (title, liens, condition, heirs) needed to make an offer." } },
  { re: /appt?\b.*process|process.*appt?|apt set.*process/i, help: { title: "Appt Set — Process/Offer", desc: "A scheduled call/meeting is booked to process the deal or deliver the offer. Show up on time; a missed appointment kills the deal." } },
  { re: /comp.*offer|offer.*comp/i, help: { title: "Comp → Offer (24 hrs)", desc: "Underwrite and price it now — you have a 24-hour clock. Acq underwrites, dispo prices with funding partners, then you call back with a number." } },
  { re: /offer call/i, help: { title: "Offer Call (ASAP)", desc: "Ready to present the offer to the seller. Make the call ASAP while interest is hot." } },
  { re: /verbal offer|negotiat/i, help: { title: "Verbal Offer — Negotiate", desc: "Offer is on the table verbally; you're working price and terms toward a yes before paper goes out." } },
  { re: /contract.*apt|apt.*sign|appt.*sign|sign.*appt/i, help: { title: "Contract Appt — Sign", desc: "A signing appointment is set. Walk them through the agreement and get the signature." } },
  { re: /contract sent|sent.*contract/i, help: { title: "Contract Sent F/U", desc: "Agreement is out for signature — follow up until it's signed. Don't let it sit unsigned." } },
  { re: /contract signed|signed.*dispo|^signed/i, help: { title: "Contract Signed", desc: "Seller signed — the deal is under contract and hands to dispositions to find a buyer and close." } },
  { re: /sent.*(agent|buyer|jvp)/i, help: { title: "Sent to Agents / Buyers / JVP", desc: "Signed deal is out to your buyer list, agents, and JV partners to source an end buyer." } },
  { re: /sent.*jv/i, help: { title: "Sent to JV Partners", desc: "Deal is shared with JV partners to co-wholesale or move volume you can't place alone." } },
  { re: /received.*offer|\d+ offers/i, help: { title: "Received 3 Offers", desc: "Buyer offers are coming in. The rule: never accept or reduce the seller until you have at least 3 offers to rack-and-stack." } },
  { re: /overpric/i, help: { title: "Overpriced (Nurture)", desc: "Seller's price is above what buyers will pay. Park it on light follow-up; circle back for a reduction after market feedback." } },
  { re: /sell land.*sign|sell.*then sign/i, help: { title: "Sell Land Then Sign", desc: "Dispo is lining up the buyer before the seller signs — contract and assignment come together." } },
  { re: /on market|reduction/i, help: { title: "On Market / Reduction", desc: "Listed or actively marketed. If it sits (30+ DOM) with under 3 offers, run the Reduction Play with the seller." } },
  { re: /deal won|escrow closed|closed|won/i, help: { title: "Deal Won", desc: "Escrow closed and paid. The finish line — logged to revenue." } },
  { re: /dnc|stop|do not contact/i, help: { title: "DNC — Do Not Contact", desc: "Seller asked to stop / texted STOP / was hostile. No calls, texts, or emails — this is a legal suppression list." } },
  { re: /hostile/i, help: { title: "Hostile", desc: "Angry or threatening contact. Keep for the record; do not reach out again." } },
  { re: /dead|not motivated|not interested|lost/i, help: { title: "Dead", desc: "No deal — not motivated, bad area, sold to a competitor, or rejected all offers. Archived, out of the active pipeline." } },
  { re: /timeline.*1.?3|1.?3 ?month/i, help: { title: "Timeline: 1–3 Months (Warm Cold)", desc: "Motivation or circumstances expected to change this quarter. Keep warm with regular touches." } },
  { re: /timeline.*6.?12|6.?12 ?month/i, help: { title: "Timeline: 6–12 Months", desc: "Mid-term follow-up — light automated touchpoints or quarterly check-ins until the timeline nears." } },
  { re: /timeline.*1.?2 ?year|1.?2 ?year/i, help: { title: "Timeline: 1–2 Years", desc: "Long-term hold — low-frequency drip or annual check-ins. Don't lose it, don't over-work it." } },
  { re: /re.?engage|revive/i, help: { title: "Re-engagement / Revived", desc: "A cold lead showed fresh activity (opened an email, replied to a broadcast, visited the site). Reassign to a rep and work it like warm." } },
  { re: /unresponsive|ghost/i, help: { title: "Unresponsive / Ghosted", desc: "Stopped responding mid-conversation but never said no. Keep trying new angles before giving up." } },
  { re: /contacted/i, help: { title: "Contacted", desc: "First outreach made — waiting on or working toward a real conversation." } },
];

export function stageHelp(label: string): Help | null {
  const s = (label || "").trim();
  if (!s) return null;
  for (const r of RULES) if (r.re.test(s)) return r.help;
  return null;
}
