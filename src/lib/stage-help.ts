// 🧭 Stage explanations (Jon 2026-10-13): hovering a pipeline stage should say
// what that stage MEANS and what the rep does there — like the proposed-stages
// panel. Matched by keyword against the stage label so it works across every
// pipeline (acq / dispo / cold / custom) without per-stage config.
//
// 🧑‍🏫 Training-aid upgrade (Jon 2026-11-17): each stage can also carry a cheat
// sheet — 🤖 what runs automatically here, ➡️ where leads move to, ✅ the rep's
// job — so the whole team can see, right on the board, what automations are set
// up and what moves to what. The LIVE drip-sequence name is added by the board
// from /api/crm/sequences, so this file never goes stale when sequences change.
type Help = {
  title: string;
  desc: string;
  autos?: string[]; // 🤖 what happens automatically while a lead sits in this stage
  moves?: string[]; // ➡️ what moves a lead OUT of this stage, and to where
  todo?: string;    // ✅ the human's job in this stage
};

// 🔁 Rules that apply in EVERY stage — shown at the bottom of every cheat sheet so
// the team always knows the guardrails, no matter where the lead is.
export const UNIVERSAL_RULES: string[] = [
  "💬 If the seller texts or emails back, the drip auto-PAUSES — we never talk over a live person. Their reply is flagged for a human to answer.",
  "🛑 Move a lead to Dead / Not Motivated and EVERY automation stops instantly (all drips + SMS + email).",
  "🚫 If they say stop / go hostile / ask who we are legally, they're auto-routed to Dead / DNC and suppressed — no further contact.",
  "🌙 Quiet hours 9pm–8am (the lead's local time): no automated texts or calls go out.",
];

const RULES: { re: RegExp; help: Help }[] = [
  { re: /10 ?days? of hell|qualif/i, help: {
    title: "10 Days of Hell — Qualify",
    desc: "Brand-new lead in the first hard-follow-up window. Hit them fast and often to qualify motivation, timeline, and price. Move forward the moment they engage.",
    autos: ["📨 The 10-Days-of-Hell SMS cadence auto-sends on a schedule (local-buyer tone, our name scrubbed)."],
    moves: ["Engages / qualifies → push to Follow-Up / Offer track", "No answer after the cadence runs out → Nurture", "Not interested → Dead (stops all automations)"],
    todo: "Call twice, fast. Qualify motivation, timeline, and price — the drip backs you up between calls.",
  } },
  { re: /\bnew\b|new lead|<\s*1 ?min/i, help: {
    title: "New",
    desc: "Just entered the system — never worked. Call within 1 minute (speed-to-lead) before it goes cold.",
    autos: ["✉️ A welcome text may auto-send when the lead is created.", "📞 A speed-to-lead call task is created so it's worked now."],
    moves: ["Worked & connected → next stage in the pipeline", "Never reachable → Nurture"],
    todo: "Call within 1 minute — twice — before it cools. Log what happened.",
  } },
  { re: /nurtur/i, help: {
    title: "Nurture",
    desc: "Not ready now but not dead — motivation or circumstances may change. Light automated touches + quarterly check-ins keep it warm until it moves.",
    autos: ["🌱 A low-frequency drip keeps the lead warm automatically."],
    moves: ["Replies / re-engages → back to active Follow-Up", "Stays cold → remains here on the slow drip"],
    todo: "Let automation warm it. Jump in the moment they reply.",
  } },
  { re: /process call/i, help: {
    title: "Process Call F/U",
    desc: "You've had the first real conversation; now follow up to gather the info (title, liens, condition, heirs) needed to make an offer.",
    moves: ["Info gathered → Comp → Offer", "Goes quiet → Nurture"],
    todo: "Collect title, liens, condition, heirs — everything underwriting needs.",
  } },
  { re: /appt?\b.*process|process.*appt?|apt set.*process/i, help: {
    title: "Appt Set — Process/Offer",
    desc: "A scheduled call/meeting is booked to process the deal or deliver the offer. Show up on time; a missed appointment kills the deal.",
    autos: ["📅 A calendar invite is sent and a reminder is set."],
    moves: ["Appointment held → Offer Call / Negotiate", "No-show → back to Follow-Up"],
    todo: "Show up on time and prepared. A missed appointment kills the deal.",
  } },
  { re: /comp.*offer|offer.*comp/i, help: {
    title: "Comp → Offer (24 hrs)",
    desc: "Underwrite and price it now — you have a 24-hour clock. Acq underwrites, dispo prices with funding partners, then you call back with a number.",
    autos: ["⏱ A 24-hour underwrite clock + a dispo pricing task are auto-created."],
    moves: ["Priced → Offer Call", "No viable number → Dead"],
    todo: "Underwrite now. Call back with a number inside 24 hours.",
  } },
  { re: /offer call/i, help: {
    title: "Offer Call (ASAP)",
    desc: "Ready to present the offer to the seller. Make the call ASAP while interest is hot.",
    autos: ["💬 Offer-chase texts begin auto-sending — asking their questions / thoughts on the offer."],
    moves: ["Accepts → Contract Sent", "Negotiating → Verbal Offer", "Declines → Dead"],
    todo: "Call ASAP and present the number while interest is hot.",
  } },
  { re: /verbal offer|negotiat/i, help: {
    title: "Verbal Offer — Negotiate",
    desc: "Offer is on the table verbally; you're working price and terms toward a yes before paper goes out.",
    autos: ["💬 Chase texts auto-send asking their questions / thoughts.", "⏳ Day 10: an 'offer expires in 72 hours' text sends.", "⌛ Day 13 (72h later): an 'offer expired' text sends."],
    moves: ["Accepts → Contract Sent", "30+ days, no updates & won't answer → Cold / Ghosted Offer", "Declines → Dead"],
    todo: "Keep calling for their decision; the chase + expiry texts create urgency for you.",
  } },
  { re: /contract.*apt|apt.*sign|appt.*sign|sign.*appt/i, help: {
    title: "Contract Appt — Sign",
    desc: "A signing appointment is set. Walk them through the agreement and get the signature.",
    autos: ["📅 Signing invite + reminder are sent."],
    moves: ["Signed → Contract Signed → Dispo", "Backs out → Dead"],
    todo: "Walk them through the agreement and get the signature.",
  } },
  { re: /contract sent|sent.*contract/i, help: {
    title: "Contract Sent F/U",
    desc: "Agreement is out for signature — follow up until it's signed. Don't let it sit unsigned.",
    autos: ["📨 A follow-up cadence runs until the contract is signed."],
    moves: ["Signed → Contract Signed → Dispo", "Won't sign → Dead"],
    todo: "Chase the signature daily. Don't let it sit unsigned.",
  } },
  { re: /contract signed|signed.*dispo|^signed/i, help: {
    title: "Contract Signed",
    desc: "Seller signed — the deal is under contract and hands to dispositions to find a buyer and close.",
    autos: ["📦 A dispo kickoff task is created to get it to cash buyers fast.", "📧 Gmail deal label + filter are set up for the address."],
    moves: ["→ Dispo: Sent to Buyers / Agents / JV", "Escrow opened → auto-creates a /closing record + coordinator task"],
    todo: "Hand to dispo immediately and arm the buyer cascade.",
  } },
  { re: /sent.*(agent|buyer|jvp)/i, help: {
    title: "Sent to Agents / Buyers / JVP",
    desc: "Signed deal is out to your buyer list, agents, and JV partners to source an end buyer.",
    autos: ["🏢 The buyer cascade / Deal Blast can push this to vetted buyers."],
    moves: ["Offers arrive → Received Offers", "Buyer secured → toward closing"],
    todo: "Work the buyer list hard — never reduce the seller before 3 offers are in.",
  } },
  { re: /sent.*jv/i, help: {
    title: "Sent to JV Partners",
    desc: "Deal is shared with JV partners to co-wholesale or move volume you can't place alone.",
    moves: ["JV finds a buyer → toward closing", "No traction → back to buyer sourcing"],
    todo: "Coordinate with JV partners; keep the seller warm.",
  } },
  { re: /received.*offer|\d+ offers/i, help: {
    title: "Received Offers",
    desc: "Buyer offers are coming in. The rule: never accept or reduce the seller until you have at least 3 offers to rack-and-stack.",
    autos: ["📥 Moving a buyer to Price/Offer-In auto-logs their offer into Offers Received."],
    moves: ["Best offer chosen → toward closing", "Offers too low → Reduction play / Nurture"],
    todo: "Rack and stack. Never accept or reduce the seller before 3 offers.",
  } },
  { re: /overpric/i, help: {
    title: "Overpriced (Nurture)",
    desc: "Seller's price is above what buyers will pay. Park it on light follow-up; circle back for a reduction after market feedback.",
    autos: ["🌱 Light nurture drip keeps it warm."],
    moves: ["Comes down on price → back to active", "Stays firm → Nurture / Dead"],
    todo: "Circle back for a reduction after you have market feedback.",
  } },
  { re: /sell land.*sign|sell.*then sign/i, help: {
    title: "Sell Land Then Sign",
    desc: "Dispo is lining up the buyer before the seller signs — contract and assignment come together.",
    moves: ["Buyer lined up → sign seller + assign", "No buyer → Nurture"],
    todo: "Line up the buyer first, then bring contract + assignment together.",
  } },
  { re: /on market|reduction/i, help: {
    title: "On Market / Reduction",
    desc: "Listed or actively marketed. If it sits (30+ DOM) with under 3 offers, run the Reduction Play with the seller.",
    moves: ["Sells → toward closing", "30+ DOM, <3 offers → Reduction play"],
    todo: "Watch days-on-market. Run the Reduction Play if it stalls.",
  } },
  { re: /deal won|escrow closed|closed|won/i, help: {
    title: "Deal Won",
    desc: "Escrow closed and paid. The finish line — logged to revenue.",
    autos: ["🏆 A closed deal is generated on the Deals board and logged to revenue."],
    moves: ["Done — the finish line."],
    todo: "Celebrate. Make sure the payout + paperwork are filed.",
  } },
  { re: /dnc|stop|do not contact/i, help: {
    title: "DNC — Do Not Contact",
    desc: "Seller asked to stop / texted STOP / was hostile. No calls, texts, or emails — this is a legal suppression list.",
    autos: ["🛑 ALL automations are stopped and the contact is suppressed everywhere."],
    moves: ["Stays here — legal suppression list."],
    todo: "Do NOT contact. This is a legal suppression list.",
  } },
  { re: /hostile/i, help: {
    title: "Hostile",
    desc: "Angry or threatening contact. Keep for the record; do not reach out again.",
    autos: ["🛑 ALL automations stopped."],
    moves: ["Stays here for the record."],
    todo: "Do not reach out again. Keep for the record.",
  } },
  { re: /dead|not motivated|not interested|lost/i, help: {
    title: "Dead",
    desc: "No deal — not motivated, bad area, sold to a competitor, or rejected all offers. Archived, out of the active pipeline.",
    autos: ["🛑 Every automation stops the instant a lead lands here (drips + SMS + email)."],
    moves: ["Restore to a pipeline to reactivate it later."],
    todo: "Nothing — automations are off. Restore it if something changes.",
  } },
  { re: /timeline.*1.?3|1.?3 ?month/i, help: { title: "Timeline: 1–3 Months (Warm Cold)", desc: "Motivation or circumstances expected to change this quarter. Keep warm with regular touches.", autos: ["🌱 Regular warm-touch drip."], todo: "Keep warm; check in regularly." } },
  { re: /timeline.*6.?12|6.?12 ?month/i, help: { title: "Timeline: 6–12 Months", desc: "Mid-term follow-up — light automated touchpoints or quarterly check-ins until the timeline nears.", autos: ["🌱 Light automated touchpoints."], todo: "Quarterly check-ins until the timeline nears." } },
  { re: /timeline.*1.?2 ?year|1.?2 ?year/i, help: { title: "Timeline: 1–2 Years", desc: "Long-term hold — low-frequency drip or annual check-ins. Don't lose it, don't over-work it.", autos: ["🌱 Low-frequency drip."], todo: "Annual check-ins. Don't over-work it." } },
  { re: /re.?engage|revive/i, help: {
    title: "Re-engagement / Revived",
    desc: "A cold lead showed fresh activity (opened an email, replied to a broadcast, visited the site). Reassign to a rep and work it like warm.",
    moves: ["Replies → active Follow-Up (routed to a human)", "Goes quiet again → Cold / Nurture"],
    todo: "Treat it like a warm lead — call fast, twice.",
  } },
  { re: /unresponsive|ghost/i, help: {
    title: "Unresponsive / Ghosted",
    desc: "Stopped responding mid-conversation but never said no. Keep trying new angles before giving up.",
    autos: ["🌱 Cold re-engagement drip keeps trying.", "↩️ ANY reply → auto-moved to Michelle's Follow-Up for a human to take over."],
    moves: ["Replies → Michelle's Follow-Up", "Never responds → stays cold"],
    todo: "Let the drip revive them; a human takes over the moment they reply.",
  } },
  { re: /contacted/i, help: { title: "Contacted", desc: "First outreach made — waiting on or working toward a real conversation.", moves: ["Real conversation → next stage", "No answer → Follow-Up / Nurture"], todo: "Keep calling toward a real conversation — twice before you move on." } },
];

export function stageHelp(label: string): Help | null {
  const s = (label || "").trim();
  if (!s) return null;
  for (const r of RULES) if (r.re.test(s)) return r.help;
  return null;
}
