// Playbooks — internal reference guides that teach the mechanics of a deal. Written
// in-house from our training material. Educational only; always confirm with a licensed
// attorney / title company before executing a contract.

export interface PBSection { heading: string; body?: string; bullets?: string[]; tip?: string; }
export interface Playbook {
  key: string; title: string; emoji: string; category: string; summary: string; sections: PBSection[];
}

export const PLAYBOOK_CATEGORIES = ["Our Contracts", "Contracts & Terms", "Escrow & Closing"] as const;

export const PLAYBOOKS: Playbook[] = [
  {
    key: "k_cash", title: "Cash Purchase Agreement (CRPA)", emoji: "💵", category: "Our Contracts",
    summary: "Our standard cash offer — the simplest agreement, for a straight cash purchase with no financing.",
    sections: [
      { heading: "When to use it", body: "A clean cash deal: we pay the seller a net amount and close through escrow, AS-IS. This is the default agreement for most distressed / motivated-seller deals." },
      { heading: "AS-IS + what's included", body: "The property is sold AS-IS with no warranties. It includes all fixtures and permanently-attached items, and anything the seller leaves behind becomes ours." },
      { heading: "Net amount", body: "The seller receives a stated NET sum at closing — we're quoting them the number they walk away with, not a gross price they then pay costs out of." },
      { heading: "Due-diligence period", body: "We get a set number of BUSINESS days from signing to inspect and do due diligence, and we can cancel during that window for a full refund of the earnest money. This is our built-in exit while we line up the buyer.", tip: "Business days (not calendar) quietly buys a few extra days each week." },
      { heading: "Title contingency", body: "Contingent on the seller delivering clear, insurable title. We can extend closing to clear title; if it can't be made insurable, the deal ends and the EMD is refunded." },
      { heading: "Possession options", bullets: ["Vacant — delivered empty, confirmed by final walkthrough", "Tenant(s) in place — subject to existing leases; seller provides leases + estoppels", "Seller lease-back — seller stays after closing under a separate Post-Closing Occupancy Agreement"] },
      { heading: "The clauses that protect us", bullets: ["No-shop: seller can't list/sell/lease/encumber to anyone else while under contract", "“and/or assigns”: we can close through an affiliate, partner, or assignee with no change to the seller's number", "Liquidated damages: if we don't close, the seller keeps the EMD as full compensation — our max risk is the deposit", "Material damage: if the property is damaged before closing, we can terminate + full refund", "72-hour expiration: the offer expires 72 hours after it's sent"] },
    ],
  },
  {
    key: "k_finance", title: "Financing / Creative Agreement (CRPA)", emoji: "🏦", category: "Our Contracts",
    summary: "For creative deals — subject-to existing loans and/or seller financing, not a straight cash close.",
    sections: [
      { heading: "When to use it", body: "Seller-finance, subject-to, or hybrid deals where the price is paid with a mix of cash, taking over existing loans, and/or a note the seller carries." },
      { heading: "How the price is built", body: "The Total Purchase Price = cash consideration (earnest money + cash down at closing) + any subject-to existing financing + any seller financing. Check the pieces that apply.", bullets: ["Seller acknowledges the agreed price may not equal current fair market value"] },
      { heading: "Subject-to existing financing", bullets: ["We take title SUBJECT TO the seller's existing loan(s) — we don't formally assume them, but we make the payments to keep them current", "Payment responsibility from a start date: principal, interest, escrow items, taxes, HOA, insurance", "Loan-balance adjustments: if the real balance differs from what's stated, the price or our cash adjusts", "Seller waives any leftover lender escrow/impound funds", "Due-on-sale disclosure: transferring title without lender consent can trigger a due-on-sale clause — we accept that risk and indemnify the seller"] },
      { heading: "Seller financing", body: "Any remaining balance is a Promissory Note we sign in the seller's favor at an agreed interest rate, secured by a mortgage/deed of trust. The note's detailed terms live in Section II." },
    ],
  },
  {
    key: "k_novation", title: "Novation Agreement (NRPA)", emoji: "🔁", category: "Our Contracts",
    summary: "For novation exits — we lock it up, market/list it, then substitute the end buyer so title conveys directly to them.",
    sections: [
      { heading: "When to use it", body: "Novation deals — especially retail/MLS resale where we improve and market the listing and the end buyer ultimately closes directly with the seller. It carries the same AS-IS / net / due-diligence / title / possession backbone as the cash agreement, plus the novation disclosures below." },
      { heading: "Marketing + listing rights", body: "The seller authorizes us to market and list the property for resale — including on the MLS — during the term of the agreement. This is what lets us take it retail." },
      { heading: "Assignment + novation", body: "We may assign the agreement OR novate it — substitute a brand-new agreement between the seller and the end buyer. The seller agrees to cooperate and sign the novation/replacement documents so title conveys directly to the end buyer." },
      { heading: "Our compensation", body: "Our fee is the difference between the price the end buyer pays and the seller's agreed net proceeds — the spread. Because it's a novation, that's structured as our assignment/novation fee." },
    ],
  },
  {
    key: "k_lux", title: "Purchase Contract & Escrow Instructions (LRPA)", emoji: "🏛️", category: "Our Contracts",
    summary: "Our formal, detailed contract that doubles as escrow instructions — for higher-end / luxury deals.",
    sections: [
      { heading: "When to use it", body: "Larger or luxury transactions where a more formal, section-numbered contract that also serves as the escrow instructions is expected." },
      { heading: "Basic Terms (Section 1)", body: "Spells out property + APN, purchase price, earnest money (“Deposit”), Close of Escrow date, the escrow office + agent, and the parties, all up front." },
      { heading: "Inspection period", body: "20 business days if left blank, and it auto-extends to the next business day if it lands on a weekend or holiday. We can cancel in our sole discretion during this window and get the Deposit back." },
      { heading: "Title (ALTA)", body: "Escrow orders an ALTA Owner's Title Policy commitment. The seller must clear all liens/clouds/encumbrances by closing — and we can extend the Close of Escrow up to a full year if needed to clear title." },
      { heading: "Deposit release", body: "The seller irrevocably instructs escrow to return our Deposit if we cancel during the inspection period — no extra sign-off required from the seller." },
      { heading: "Closing cost allocations", body: "Checkboxes assign who pays escrow fees, the title policy, HOA fees, and transfer taxes (50/50 or 100% Buyer) — negotiate these per deal." },
    ],
  },
  {
    key: "k_amend", title: "Amendment to Agreement", emoji: "✍️", category: "Our Contracts",
    summary: "A short form to change any term of an already-signed agreement — use it instead of redoing the whole contract.",
    sections: [
      { heading: "When to use it", body: "Any time a signed agreement needs a change — price, dates, terms, parties. Amend it; don't rewrite the whole thing." },
      { heading: "How it works", bullets: ["“Amendment(s)” — write exactly what's changing", "“Other Terms” — everything else in the original agreement stays the same", "Effective on signing; can be signed electronically and in counterparts"] },
    ],
  },
  {
    key: "k_coming", title: "Coming soon: Assignment + Seller-in-Possession", emoji: "⏳", category: "Our Contracts",
    summary: "Two more contracts to be added — the Assignment of Contract Agreement and the Seller-in-Possession Agreement.",
    sections: [
      { heading: "Assignment of Contract Agreement", body: "The document that transfers our purchase contract to the end buyer for our assignment fee. Send Jon the file and it'll be explained here." },
      { heading: "Seller-in-Possession Agreement", body: "Covers a seller who stays in the property after closing (a lease-back / post-closing occupancy). Send the file and it'll be added with its terms." },
    ],
  },
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
