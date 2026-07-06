// Playbooks — internal reference guides that teach the mechanics of a deal. Written
// in-house from our training material. Educational only; always confirm with a licensed
// attorney / title company before executing a contract.

export interface PBSection { heading: string; body?: string; bullets?: string[]; tip?: string; }
export interface Playbook {
  key: string; title: string; emoji: string; category: string; summary: string; sections: PBSection[];
}

export const PLAYBOOK_CATEGORIES = ["Contracts & Terms", "Escrow & Closing"] as const;

export const PLAYBOOKS: Playbook[] = [
  {
    key: "contract_must_haves", title: "Purchase Contract Must-Haves", emoji: "📄", category: "Contracts & Terms",
    summary: "The clauses that have to be in every purchase contract so you can wholesale the deal and stay protected.",
    sections: [
      { heading: "1 · Buyer line", body: "Write the buyer as your name or entity followed by “and/or assignee.” That phrase is what preserves your right to assign the contract to an end buyer — leave it off and you may not be able to wholesale the deal." },
      { heading: "2 · Inspection period", body: "Always spell out a specific number of days. This window is your built-in exit and your time to find the end buyer and do due diligence.", tip: "Use “business days” instead of calendar days — it quietly buys you a few extra days each week." },
      { heading: "3 · Default clause", body: "Add: “In the event of Buyer default, sole remedy shall be the earnest money deposit.” This caps your downside — the most the seller can keep if you walk is the EMD, and it protects you from being sued for specific performance." },
      { heading: "4 · Investor disclosure", body: "State that the buyer is an investor who may fix, remodel, add on, rebuild, resell, wholesale, assign, lease, or convert the property.", tip: "If the seller asks, frame it as: “This is standard language we put in every contract as a formality to cover every option we might use with the property.”" },
      { heading: "5 · Right to cancel", body: "Add: “Buyer reserves the right to cancel for any and all reasons during the inspection period.” Combined with the default clause, your maximum risk is limited to the earnest money." },
      { heading: "6 · Title / escrow / closing costs", body: "Spell out who pays. “Buyer to pay all title/escrow fees and closing costs” is common — and offering to cover them can make your offer more attractive to a motivated seller who just wants a clean, simple close." },
      { heading: "⚠️ Reminder", body: "Educational only. Always have a licensed attorney review contract language before you use it." },
    ],
  },
  {
    key: "emd_guide", title: "Earnest Money Deposit (EMD)", emoji: "💰", category: "Escrow & Closing",
    summary: "How to structure your deposit so you lock up deals with the least capital and risk.",
    sections: [
      { heading: "What's standard", body: "1% of the purchase price is the standard EMD, but it's not a requirement — it's negotiable. Many sellers will accept $500–$1,000. Present your number with confidence and most won't push back.", bullets: ["$500k → 1% = $5,000 (low: $2,500)", "$1M → 1% = $10,000 (low: $5,000)", "$1.5M → 1% = $15,000 (low: $7,500)", "$2M → 1% = $20,000 (low: $10,000)"] },
      { heading: "Your options, best → last resort", bullets: [
        "①  Use your own funds — wire or cashier's check for 1% to the title company. Cleanest, most professional, shows the seller you're serious.",
        "②  Transactional funding — a funding company puts up 100% of your EMD (and the full purchase price on a double close) once you have a signed contract; you pay a small fee at closing. Zero capital risk, lets you scale.",
        "③  Negotiate a lower EMD — ask the seller to accept $500–$1,000 instead of the full 1%. Works well when you've built rapport.",
        "④  (Last resort) Inspection-period clause — “Earnest money due prior to the end of the inspection period.” Buys time to find your buyer first, but makes the offer look weaker. Only if you truly can't fund it.",
      ] },
      { heading: "Getting transactional funding", body: "Search “transactional funding for real estate,” reach out to 2–3 companies, and compare rates, requirements, and turnaround. Most require a signed purchase contract, proof of an end buyer or assignment, and a title company." },
    ],
  },
  {
    key: "double_vs_assign", title: "Double Close vs. Assignment", emoji: "🔀", category: "Escrow & Closing",
    summary: "The two ways to close a wholesale deal — and when to use each to protect your spread.",
    sections: [
      { heading: "Assignment of contract", body: "You assign your purchase contract to the end buyer.", bullets: ["Only ONE closing happens", "Your assignment fee shows on the settlement statement", "Simpler and cheaper — you never take title", "Best when your fee is reasonable relative to the deal size"] },
      { heading: "Double close (simultaneous)", body: "Two separate closings happen back-to-back — you buy from the seller (A→B), then immediately sell to your buyer (B→C).", bullets: ["Your profit is NOT disclosed to either side", "You briefly take title to the property", "You pay title + escrow fees on both transactions", "Best for large spreads where privacy matters"] },
      { heading: "★ Why double-close", body: "Neither the seller nor the buyer can see your profit. The seller only sees their sale; the buyer only sees their purchase; your spread stays invisible to both." },
      { heading: "Example", body: "Under contract with the seller at $1,500,000 (Contract A). End buyer purchases from you at $1,700,000 (Contract B). Gross spread $200,000, minus your escrow + title fees on Contract A." },
      { heading: "How it runs, step by step", bullets: [
        "Lock up the property with the seller — Contract A (you're the buyer).",
        "Find your end buyer (developer/investor) at the higher price.",
        "Send the buyer a full purchase agreement with YOU as the seller — Contract B. They have no visibility into Contract A.",
        "Open both contracts with an investor-friendly title company that can coordinate a simultaneous close.",
        "Both closings happen: A closes (you buy), B closes (they buy from you).",
      ] },
      { heading: "Rule of thumb", body: "Small or reasonable fee → assign it. Big spread or you want privacy → double close." },
    ],
  },
];
