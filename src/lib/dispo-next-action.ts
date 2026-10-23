// ⏭ Next-best-action for a dispo deal (Jon 2026-10-23, overnight velocity push). When a
// rep opens a deal, tell them the ONE move that pushes it toward sold — so nothing sits
// waiting on "what do I do with this." Pure + client-safe; the deal page feeds it state.

export type DispoNext = { icon: string; text: string; hint: string; tone: "sky" | "amber" | "emerald" | "indigo" | "rose" | "slate" };

export function nextDispoAction(s: {
  closed: boolean; out: boolean; buyerCount: number; liveOffers: number; offerGoal: number;
  accepted: boolean; hasDraft: boolean; sentForSignature: boolean; daysInStage: number;
}): DispoNext {
  if (s.closed) return { icon: "✅", text: "Deal's closed — great work.", hint: "Make sure the win + fee are logged on the closed board.", tone: "emerald" };

  // contract flow takes priority once a buyer is locked
  if (s.accepted && !s.hasDraft) return { icon: "📄", text: "Draft the assignment contract.", hint: "A buyer accepted — generate it in the Assignment contract panel from the deal's numbers.", tone: "indigo" };
  if (s.accepted && s.hasDraft && !s.sentForSignature) return { icon: "🖊", text: "Send the contract for signature.", hint: "Draft is ready — send via PandaDoc email or text the signing link.", tone: "indigo" };
  if (s.accepted && s.sentForSignature) return { icon: "⏳", text: "Chase the signature + schedule closing.", hint: "Contract is out — follow up until it's signed, then open the closing.", tone: "indigo" };

  // pre-market: get it out
  if (!s.out && s.buyerCount === 0) return { icon: "⚡", text: "Run the cascade — get it in front of buyers.", hint: "No buyers attached yet. Attach the top matched developers/agents and start the follow-up.", tone: "sky" };
  if (!s.out && s.buyerCount > 0) return { icon: "📣", text: "Send it to the attached buyers.", hint: "Buyers are lined up — blast the deal (verify the packet first) and move it to the marketing stage.", tone: "sky" };

  // out: chase the 3-offer goal
  if (s.out && s.liveOffers < s.offerGoal) return { icon: "📞", text: `Chase buyers for offers (${s.liveOffers}/${s.offerGoal}).`, hint: "Log every number that comes back — price, terms, days to close. Attach more buyers if you're short.", tone: "amber" };

  // got the offers, no acceptance yet: hand the best to the seller
  if (s.out && s.liveOffers >= s.offerGoal && !s.accepted) return { icon: "🤝", text: "Hand the best offer to the seller.", hint: "You've got the offers — present the best number (minus your spread) to the seller to lock the deal.", tone: "emerald" };

  // catch-all: if it's just sitting
  if (s.daysInStage >= 6) return { icon: "⏭", text: "Advance this deal — it's been sitting.", hint: `No movement in ${s.daysInStage} days. Take the next step or mark why it's stalled.`, tone: "rose" };

  return { icon: "👍", text: "On track — keep it moving.", hint: "Work the follow-ups and log any new offers.", tone: "slate" };
}
