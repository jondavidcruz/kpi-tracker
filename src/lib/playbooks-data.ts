// Playbooks — internal reference guides that teach the mechanics of a deal. Written
// in-house from our training material. Educational only; always confirm with a licensed
// attorney / title company before executing a contract.

export interface PBSection { heading: string; body?: string; bullets?: string[]; tip?: string; }
export interface Playbook {
  key: string; title: string; emoji: string; category: string; summary: string; sections: PBSection[];
  pdfUrl?: string;               // the real document, viewable inline + downloadable
  pdfLabel?: string;             // link text for the PDF
  images?: { src: string; caption?: string }[]; // real page images (e.g. a HUD statement)
  callouts?: { label: string; note: string }[]; // "what to look for" highlights
  diagram?: string;              // key of an inline how-it-works diagram (assignment | double_close | subject_to | novation)
}

export const PLAYBOOK_CATEGORIES = ["Deal Analysis", "Scripts & Outreach", "Our Contracts", "Real Closings (HUDs)", "Contracts & Terms", "Escrow & Closing", "Training Library", "Land Courses"] as const;

export const PLAYBOOKS: Playbook[] = [
  {
    key: "k_analyze_deal", title: "How To Analyze A Developer Deal (SOP)", emoji: "🏗️", category: "Deal Analysis",
    summary: "The Lux Blueprint step-by-step: how to look at a lot and figure out the most we should offer (the MAO) for a land-for-luxury-builds deal.",
    pdfUrl: "/playbooks/sop/how-to-analyze-a-deal.pdf", pdfLabel: "the full Student Guide (SOP)",
    images: [
      { src: "/playbooks/sop/analyze-deal-1.png", caption: "SOP p1 — the goal + Step 1 (what the seller wants)" },
      { src: "/playbooks/sop/analyze-deal-2.png", caption: "p2 — Zillow check + confirm luxury new builds" },
      { src: "/playbooks/sop/analyze-deal-3.png", caption: "p3 — study the LOT (buildable area, main road)" },
      { src: "/playbooks/sop/analyze-deal-4.png", caption: "p4 — comps + the Water Rule" },
      { src: "/playbooks/sop/analyze-deal-5.png", caption: "p5 — the 3 methods → your number" },
      { src: "/playbooks/sop/analyze-deal-6.png", caption: "p6 — pick a conservative MAO + when to kill" },
    ],
    sections: [
      { heading: "🎯 The whole game", body: "We buy land for luxury new builds. A developer wants a lot, tears down the old house, and builds something big and expensive. Your job: find lots they'd want and a price where the developer still makes good money — a number you can DEFEND with comps. Then you run it in the Underwriting calculator → Developer tab." },
      { heading: "Step 1 — Get the seller's number first", body: "Before any comps, ask the seller their asking price and how fast they want to close. Write it down — it's what you compare your final offer to. (e.g. they want $1.25M, 60–90 day close.)" },
      { heading: "Step 2 — Pull it up on Zillow", bullets: ["FOR SALE = stop. We don't touch listed properties (already out in the open with an agent). Mark it dead.", "SOLD recently = scroll to price history for when + how much.", "Note anything odd (e.g. listed sold $960k but seller asking $950k) and keep digging."] },
      { heading: "Step 3 — Confirm luxury new builds ($2M+)", body: "Make-or-break. Scroll the Zillow map. You want new builds selling over $2M nearby. No luxury new builds = no developer demand = kill the deal." },
      { heading: "Step 5 — Study the LOT, not the house", bullets: ["Lot size — write it down; compare to similar-size lots.", "Main roads (3+ lanes, or yellow center lines) hurt the price — developers avoid busy roads. Compare to other main-road lots for a fair match.", "BUILDABLE area — the paper lot ≠ what you can build on. A cul-de-sac curve or setback can cut it a lot (one 0.42-ac lot was really ~0.28 ac buildable → MAO dropped to $1.1M). Always value the buildable land."] },
      { heading: "Step 6 — Find your comps", bullets: ["New-build comps — recent luxury builds show the high-end finished value.", "Teardown / land comps (most important) — old, small, run-down houses on lots like yours, and what they sold for. A 1,400 sqft old house on a good lot that sold for $960k is a teardown buy.", "Trick: open a new build → price history → what the builder PAID for the raw lot before building. That's the real land value.", "Use MORE than one comp — one sale may include permits/plans and read high."] },
      { heading: "🌊 The Water Rule", body: "Waterfront only compares to waterfront. If your lot is on the water, use only waterfront comps; if it's not, never use waterfront comps (they'll make your number way too high)." },
      { heading: "Step 7 — Turn comps into your number (the 3 methods)", bullets: ["① New builds FOR SALE — average the developers' lot-purchase prices, bumped up for market growth (≈% per year × years).", "② New builds that SOLD — same: find the raw-lot buy, average, bump for growth.", "③ Teardowns that SOLD — old (30+ yrs) + small (house under ~25% of nearby new-build size) + looks run-down (eye test). Average, bump for growth.", "The three should land close. Drop any that's way off. Their average = your DISPO PRICE (land value)."], tip: "Plug ①②③ straight into the Developer tab and it averages them to the dispo price for you." },
      { heading: "🎯 Pick your MAO (stay conservative)", body: "MAO = dispo price − $100,000 to $150,000. That gap is your room to profit and keeps the assignment fee in six figures (the whole point). The least you should ever subtract is $50k — but Lux Blueprint pushes for the six-figure fee, so $100–150k is the goal. Always lean to the safe, lower MAO — the worst thing is pushing a high number and failing to move the deal." },
      { heading: "🚫 When to kill a deal", bullets: ["No luxury new builds ($2M+) nearby — no developer demand.", "Already listed on the MLS or FSBO.", "Price too far off — seller wants so much your MAO is way below them, no room to meet.", "Incomplete — no real asking price (e.g. \"above market value\" isn't a number) → mark incomplete, not dead."] },
    ],
  },
  {
    key: "k_cash", title: "Cash Purchase Agreement (CRPA)", emoji: "💵", category: "Our Contracts",
    summary: "Our standard cash offer — the simplest agreement, for a straight cash purchase with no financing.",
    pdfUrl: "/playbooks/contracts/cash-crpa.pdf", pdfLabel: "the actual Cash Agreement",
    diagram: "assignment",
    images: [{ src: "/playbooks/contracts/cash-crpa-1.png", caption: "Our real Cash Purchase Agreement" }],
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
    pdfUrl: "/playbooks/contracts/financing-crpa.pdf", pdfLabel: "the actual Financing Agreement",
    diagram: "subject_to",
    images: [
      { src: "/playbooks/contracts/financing-crpa-1.png", caption: "Financing / Creative Agreement — page 1" },
      { src: "/playbooks/contracts/financing-crpa-2.png", caption: "Page 2 — subject-to + seller-financing terms" },
      { src: "/playbooks/contracts/financing-crpa-3.png", caption: "Page 3" },
      { src: "/playbooks/contracts/financing-crpa-4.png", caption: "Page 4" },
    ],
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
    pdfUrl: "/playbooks/contracts/novation-nrpa.pdf", pdfLabel: "the actual Novation Agreement",
    diagram: "novation",
    images: [
      { src: "/playbooks/contracts/novation-nrpa-1.png", caption: "Novation Agreement — page 1" },
      { src: "/playbooks/contracts/novation-nrpa-2.png", caption: "Page 2 — novation, marketing & fee disclosures" },
    ],
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
    pdfUrl: "/playbooks/contracts/luxury-lrpa.pdf", pdfLabel: "the actual Purchase Contract & Escrow Instructions",
    images: [
      { src: "/playbooks/contracts/luxury-lrpa-1.png", caption: "Purchase Contract & Escrow Instructions — page 1 (Basic Terms)" },
      { src: "/playbooks/contracts/luxury-lrpa-2.png", caption: "Page 2" },
      { src: "/playbooks/contracts/luxury-lrpa-3.png", caption: "Page 3" },
    ],
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
    pdfUrl: "/playbooks/contracts/amendment.pdf", pdfLabel: "the actual Amendment form",
    images: [{ src: "/playbooks/contracts/amendment-1.png", caption: "The real Amendment to Agreement form" }],
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
    key: "hud_assignment", title: "Assignment HUD — 1251 Leighton Ave (LA)", emoji: "🧾", category: "Real Closings (HUDs)",
    summary: "A real assignment closing statement. Dispositions: this is exactly what to look for on the HUD when you request it from escrow — find our assignment fee and confirm it.",
    sections: [
      { heading: "What this deal was", body: "A straight assignment. Total consideration (sale price) $430,000. We never took title — we assigned our contract to the end buyer and collected our fee at closing." },
      { heading: "🎯 Dispositions — what to look for", body: "When escrow sends the HUD / settlement statement, scan the debits (disbursements) for OUR line. On this deal, page 2 under ADDITIONAL DISBURSEMENTS reads: “Assignment Fee: Freedom-Offers.com — $90,000.00.” That line is our money. Always confirm it's there and the amount matches what we agreed BEFORE you approve the statement." },
      { heading: "The numbers that should tie out", bullets: ["Total consideration (sale price): $430,000", "Our assignment fee → Freedom-Offers.com: $90,000", "Subtotals and Totals must balance ($555,580.37 = $555,580.37)"] },
      { heading: "Why it matters", body: "Escrow sometimes sends a draft with our fee missing, mislabeled, or wrong. Catching it before signing is how we protect the fee. If our line isn't there or the number is off, kick it back to escrow before approving anything." },
    ],
    diagram: "assignment",
    callouts: [{ label: "Assignment Fee: Freedom-Offers.com — $90,000", note: "Page 2, under Additional Disbursements. THE line to verify on every assignment HUD." }],
    images: [
      { src: "/playbooks/hud/leighton-2.png", caption: "Page 2 — the assignment fee: $90,000 to Freedom-Offers.com" },
      { src: "/playbooks/hud/leighton-1.png", caption: "Page 1 — total consideration $430,000 + all charges" },
    ],
    pdfUrl: "/playbooks/hud/hud-leighton.pdf", pdfLabel: "the full Leighton HUD",
  },
  {
    key: "hud_double_close", title: "Double Close / Wholetail — 1528 W. Virginia St (San Bernardino)", emoji: "🏆", category: "Real Closings (HUDs)",
    summary: "Our highest-profit deal. We bought it with our own funds, cleaned it up, and resold it — a wholetail via a double close. Two closings = two HUDs = two sets of closing costs.",
    diagram: "double_close",
    sections: [
      { heading: "What a double close / wholetail is", body: "Instead of assigning, we actually BUY the property (closing #1), then SELL it (closing #2). On a wholetail we fix/clean it up in between and put it back on the market for full retail. Because there are two separate closings, there are two HUDs — and you pay title + escrow fees TWICE." },
      { heading: "Closing #1 — we BUY (HUD #1)", bullets: ["Total consideration (our purchase): $198,181.92", "Earnest money: $10,000 (with a matching $10,000 return-of-EMD line)", "We financed the buy — lender / underwriting / origination fees (Emet Mortgage · Simplified Home Loans)", "Title + escrow charges (First American Title + Granite Escrow) — closing-cost set #1"] },
      { heading: "Closing #2 — we SELL (HUD #2)", bullets: ["Seller: Freedom Offers, LLC · total consideration (our sale): $360,000", "Title + escrow charges AGAIN — closing-cost set #2", "Loan Payoff → CMG Financial: $190,085.90 — paying off the loan we used to buy", "Totals balance at $360,000"] },
      { heading: "🎯 What the team should see", bullets: ["Bought ~$198K, sold $360K — the spread is the gross profit before costs", "Closing costs appear TWICE (once per HUD) — always factor both when underwriting a double close", "The purchase loan is paid off on the sale side ($190K payoff) — the sale has to cover it", "A double close costs more than an assignment, but it lets us capture a big spread privately (buyer + seller never see each other's number) and wholetail for full value"] },
      { heading: "Why we double-closed instead of assigning", body: "A $160K+ spread is too big to show as an assignment fee on one settlement statement — it can spook the parties and blow up the deal. Buying and reselling keeps our profit private and let us fix + wholetail the property for full retail." },
    ],
    images: [
      { src: "/playbooks/hud/sb-buy-1.png", caption: "HUD #1 (we buy) — $198,181.92, financing + closing-cost set #1" },
      { src: "/playbooks/hud/sb-buy-2.png", caption: "HUD #1 p2 — charges + $10K return of EMD" },
      { src: "/playbooks/hud/sb-sell-1.png", caption: "HUD #2 (we sell) — $360,000, closing-cost set #2 + $190K loan payoff" },
    ],
    pdfUrl: "/playbooks/hud/hud-sb-buy.pdf", pdfLabel: "HUD #1 (the buy side)",
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
    diagram: "double_close",
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
  {
    key: "k_pof_objection", title: "Objection Handler — “Can you show proof of funds?”", emoji: "💬", category: "Scripts & Outreach",
    summary: "The exact way to answer a seller who asks for a proof of funds before signing — turn it into a trust-builder, not a red flag.",
    pdfUrl: "/playbooks/resources/pof-objection-handler.pdf", pdfLabel: "one-page POF Objection Handler",
    sections: [
      { heading: "The situation", body: "A seller asks for a proof of funds before signing. Common with experienced sellers or anyone who's been burned before. It's a logical question with a logical answer — don't panic." },
      { heading: "What to say", body: "“Absolutely — and great question. I'll have a proof of funds to you during the inspection period, and here's why. As soon as we go under contract, we start shopping lenders for the best rate. Lenders won't underwrite or issue quotes until there's a signed contract in place, so we need that first. Once we lock in the best option, we get the POF letter directly from that lender and send it right over. And to give you total peace of mind, we can write it right into the contract that a proof of funds will be provided during the inspection period — so it's not just my word, it's baked into the agreement and you're fully protected.”" },
      { heading: "Why it works", bullets: [
        "Positions you as a sophisticated buyer explaining a strategic financing process — not dodging.",
        "Follows real lending logic: lenders genuinely require a signed contract before underwriting (true + verifiable).",
        "Offering to write the POF commitment into the contract removes the risk from the seller's side.",
        "Transparency about your process makes sellers more comfortable, not less.",
      ] },
      { heading: "Contract language to add", body: "“Buyer shall provide Seller with a Proof of Funds (POF) letter from an approved lender within the agreed-upon inspection period.”", tip: "Add that one clause to every contract and this objection disappears for good — it's handled before it's ever raised." },
    ],
  },
  {
    key: "k_seller_texting", title: "Seller Texting — the right way (SMS)", emoji: "📱", category: "Scripts & Outreach",
    summary: "How to run a seller conversation over text like a pro — and how to present an offer over text so it reads as parity, not a discount.",
    sections: [
      { heading: "Mindset — texting is a channel, not a downgrade", body: "Some sellers only want to text, and that's fine — it's a fully viable path to a closed deal (30% of Lux Blueprint deals close without ever getting the seller on the phone). Many sophisticated, high-net-worth sellers actually prefer text: their time is limited and they screen calls. Don't assume a texter is unserious — in the luxury space it's often the opposite. Treat every text as a written record of your professionalism." },
      { heading: "One clean message — never five one-liners", body: "Don't fire off five separate texts with one question each — it looks scattered and floods their phone, and many sellers stop responding. Group your questions into a single, well-formatted message." },
      { heading: "The good example (copy this shape)", body: "“Hi [Seller First Name], I have a few quick questions so we can stay on the same page and make sure I cross all my T's and dot all my I's:\n1. Is the property on sewer or septic?\n2. Are there any easements or setbacks I should be aware of? (e.g. a utility or power easement.)\n3. On closing — how soon are you looking to close, and would you need any post-occupancy after close of escrow?\nAppreciate it. Happy to jump on a call any time as well if that's easier.” One message, numbered, easy to answer in one reply." },
      { heading: "Rules of the road", bullets: [
        "Always lead with their first name.",
        "Group questions — never spam one-liners. Number or bullet them so they're easy to scan.",
        "Proper grammar, capitalization, punctuation. No “u” or “r.”",
        "Warm but professional — you're a buyer, not a friend.",
        "Always leave the door open to a call without forcing one.",
        "Reply during business hours when you can.",
      ] },
      { heading: "Presenting an offer over text — the template", body: "Use this every time; consistency builds credibility. The seller should understand it in five seconds:\n\nOur offer is outlined below:\nPURCHASE PRICE: $______\nEMD: $______ (Earnest Money Deposit)\nCOE: ______ (Close of Escrow)\nADDITIONAL TERMS: (if discussed)" },
      { heading: "★ Drop this line every time", body: "“Please keep in mind these numbers are net to you. No commissions or closing costs on your end. This alone saves you 7–8%, so our offer is the same as if you had sold on-market for $X.”", tip: "This reframes your offer against what they'd actually walk away with on the open market — the difference between a seller seeing a discount and a seller seeing parity. (Real example: a $2,800,000 net offer was framed as the same as selling on-market for $3,024,000.)" },
    ],
  },
  {
    key: "k_dev_text_outreach", title: "Developer Text Outreach (cold SMS)", emoji: "🏗️", category: "Scripts & Outreach",
    summary: "The first text to a developer whose build you admired — opens the relationship and gets their buy box, without sounding like an agent.",
    sections: [
      { heading: "The template", body: "“Hello,\n\nI recently came across a property your team built at (ADDRESS). Absolutely stunning work.\n\nI focus on acquiring off-market properties, and this is one of my key target markets. I wanted to see if you're currently open to new acquisition opportunities for your builds. If so, I'd love to learn more about your buy box so I can bring you deals that align with your criteria.\n\nI'm not an agent. I control the deals I put under contract. My goal is to build relationships with a select group of serious developers rather than publicly blasting opportunities. I value my partners' time and only share deals that truly fit their needs.\n\nIf this sounds like something you'd be interested in, I'd be happy to connect and learn more about what you're actively looking for.\n\nLooking forward to hearing from you.\n\nBest,\n[YOUR NAME] · [COMPANY NAME] · [PHONE NUMBER]”" },
      { heading: "Why it works", bullets: [
        "Leads with a specific, genuine compliment on a real project (ADDRESS) — not a mass blast.",
        "“I'm not an agent. I control the deals I put under contract.” — the line that separates you from every wholesaler spamming them.",
        "Exclusivity framing (“a select group of serious developers”) makes it feel like access, not a pitch.",
        "The ask is small and easy: just learn their buy box → captures the criteria you need to match deals.",
      ] },
      { heading: "Make it real before you send", bullets: [
        "Always drop in the actual ADDRESS of a build they did — no generic sends.",
        "Fill in your real name, company, and phone. Never send with brackets left in.",
        "Once they reply, get the buy box (areas, max per lot, build type) and log it in Vetted Buyers → Buyer Research.",
      ], tip: "Their reply is the goal — the buy box. As soon as you have it, add them and their criteria so the deal-matcher can flag their deals automatically." },
    ],
  },
  {
    key: "k_flip_your_future", title: "Flip Your Future — Ryan Pineda (recommended reading)", emoji: "📘", category: "Training Library",
    summary: "Our team study guide to Ryan Pineda's book on flipping houses — the mindset and the end-to-end process, summarized. (Read the full book for the detail.)",
    sections: [
      { heading: "What it is", body: "Flip Your Future by Ryan Pineda (© 2018) is a beginner-friendly walkthrough of building a house-flipping business from scratch — from mindset to finding, funding, fixing, and selling. This is a short in-house study guide to its framework; the full copyrighted book belongs to the author — read your own copy for the details and stories." },
      { heading: "The arc of the book", bullets: [
        "Journey & mindset (Ch 1–3) — why belief and the right mindset come before tactics; escaping the “normal job” trap.",
        "Choosing a market (Ch 4) — pick where to operate deliberately, not by default.",
        "The dream team (Ch 5) — the agent, contractor, lender, and title people you build around you.",
        "Evaluating deals (Ch 6) — how to know a deal is a deal before you buy.",
        "Free leads (Ch 7) & Paid leads (Ch 8) — where deals actually come from, low-cost first.",
        "Making offers (Ch 9) — turning leads into contracts.",
        "Construction (Ch 10) & The sale (Ch 11) — running the rehab and getting paid.",
      ] },
      { heading: "Why it's on our shelf", body: "It's the clearest plain-English version of the whole flip cycle — useful for anyone newer on the team to see how the pieces (leads → offers → rehab → sale) fit together, even though our lane is wholesaling/assignment, not flipping ourselves." },
      { heading: "How we use it", body: "Read it as background on the buyer's side of a deal — it makes you sharper when you talk to the flippers and developers who buy from us, because you understand their math and their risks.", tip: "This is a study guide only, not the book. We don't host the full PDF here — grab the book from the team drive or your own copy." },
    ],
  },
  {
    key: "exit_structure", title: "Which exit? Novation vs Assignment vs Double Close", emoji: "🧭", category: "Escrow & Closing",
    summary: "Pick the right closing structure by BUYER TYPE — the single biggest mistake is bolting an assignment or double close onto a novation when you don't need to.",
    sections: [
      { heading: "🧠 The reframe — these are 3 different exits, not steps", body: "Novation, Assignment, and Double Close are separate ways to get paid — not a chain. The confusion (“novation → MLS → agent → assignment addendum → double close”) comes from mixing them. In a TRUE novation you do none of the assignment/double-close mechanics: the retail buyer contracts and closes DIRECTLY with the seller on a normal purchase agreement, and you're paid your fee at closing through your novation agreement with the seller. One escrow, one transfer." },
      { heading: "✅ MLS / agent / retail buyer → do a TRUE NOVATION", body: "This is the whole reason novation exists. Because the buyer buys directly from the seller (you're not assigning), you can list on the MLS with an agent at RETAIL and sell to FINANCED buyers (FHA / conventional). You lock the seller's net; anything above it is your fee, paid at closing. No assignment addendum shown to the buyer, no double close.", tip: "Run these in the Underwriting calculator → Novation tab for the seller-payout MAO + your fee." },
      { heading: "🚫 Do NOT double-close an MLS/financed deal — the seasoning trap", bullets: [
        "A double close is TWO closings (A→B you buy, B→C you sell). On the B→C leg you're the seller of record having owned the property ~5 minutes.",
        "FHA flatly prohibits funding when the seller has owned under 90 days — virtually no exceptions. Conventional lenders scrutinize same-day resales as “illegal flipping.”",
        "Most MLS buyers are financed → a double close there gets flagged and DENIED by their lender.",
        "So double close is a CASH / hard-money buyer tool, not an MLS-retail tool.",
      ] },
      { heading: "🚫 Don't force an assignment addendum on retail either", body: "Assigning your contract to the buyer works for cash/investor buyers, but on the MLS it (a) discloses your spread and (b) doesn't fit a retail buyer's head — they think they're buying a house, not taking over your contract. It also edges toward a restricted “net listing.” Keep the assignment addendum for off-market cash deals." },
      { heading: "🎯 Pick the structure by buyer type", bullets: [
        "MLS / agent / retail (financed) buyer → TRUE NOVATION · 1 escrow · spread hidden · financed OK. ← our default for listed deals.",
        "Off-market, cash/investor, modest spread → ASSIGNMENT + assignment addendum · 1 escrow · spread disclosed.",
        "Off-market, cash/hard-money, spread you want hidden → DOUBLE CLOSE · 2 escrows · closing paid twice (use the Double-close section on the Cash tabs). NOT for financed buyers.",
      ] },
      { heading: "🧾 Make the novation clean (California)", bullets: [
        "Lock the seller FIRST — purchase agreement + novation addendum that fixes the seller's net, authorizes you to market/list, and defines your fee as the overage paid at closing.",
        "Disclose your interest — in CA you must disclose you're marketing a property you don't own; that keeps you clear of unlicensed-activity and “net listing” trouble.",
        "Use a listing agent/broker AND title/escrow that have actually done novations — most haven't, and that's where deals blow up. Have them confirm the exact forms + how your fee is disbursed.",
        "Reserve double close for cash buyers where seasoning isn't a factor.",
      ] },
      { heading: "⚠️ Not legal advice", body: "Educational only. California is aggressive on wholesaling disclosure — run the final structure past your transaction coordinator, broker, and a CA real-estate attorney before it becomes the playbook." },
    ],
  },
  // ───────────────────────── LAND COURSES (added by Claude from Jon's 3-course study) ─────────────────────────
  {
    key: "k_land_infill", title: "Infill Lots System (John — High Value Land)", emoji: "🏘️", category: "Land Courses",
    summary: "Buy vacant city lots off-market, sell to builders. Research by ZIP, pull with Direct REI, dispo through our vetted-builder list.",
    sections: [
      { heading: "🎯 The model", body: "A vacant lot between houses already has utilities — builders pay up for it because utility hookups are their biggest site cost. We contract the lot off-market and assign or double-close to a builder from our vetted list. Fees: $10–20k standard, $40–100k on sniper lots in luxury pockets." },
      { heading: "Market research (by ZIP)", bullets: ["Zillow: lots SOLD last 30 days at $50k+ per zip — count them; more sold = active builder demand.", "Satellite pass: look for the house–lot–house pattern (scattered vacant lots inside built-out streets).", "New-construction check: homes built this year per zip = builder activity (this is the ONLY reliable signal in Texas — TX is a non-disclosure state, so Zillow sold counts undercount).", "Builder permit density heat map (John's tool) as the third source when available."] },
      { heading: "Our confirmed infill markets", bullets: ["Nashville: 37013 (Antioch), 37115 (Madison) + 37138/37086/37167 · sniper: 37027 Brentwood, 37220 Oak Hill", "Houston: 77016, 77026, 77051 + 77028/77033 · gentrifying: 77004/77020/77021 · acreage: 77433/77429/77327", "Atlanta: 30327 (Tuxedo/Mt. Paran) + 30305/30342 — Goodwin buy box", "Charlotte Phase 2 (buyers first): 28205/06/08/16 + 28209/28211"] },
      { heading: "Offer math", body: "Start from the BUYER, not the seller: buyer's box price − our target fee − closing = max offer. Dalamar pays sub-$120k for 0.2ac+ Nashville lots and buys 10–40 lot packages; Goodall pays ~$50k/ac on 15+ ac within 50 miles of Nashville. Know the box before you make the call.", tip: "Buyers first, always. A lot without a matching buy box is a comp exercise, not a deal." },
      { heading: "Dispo", body: "Run the buyer cascade tool top-down (best-fit buyer first, never blast). Sharyn/Marie capture new builder boxes daily — permits, new-construction listings, cold list, builder calls." },
    ],
  },
  {
    key: "k_land_rec", title: "Recreational Land System (Hunter — Sell The Earth)", emoji: "🌲", category: "Land Courses",
    summary: "Buy rural parcels ≤5 ac for $1–5k cash off-market, resell $10–30k — cash or seller-financed at 3–7x. The county-zoning-first research method.",
    sections: [
      { heading: "🎯 The model", body: "Rural recreational parcels 1–3 hours outside a metro. Buy for a few thousand cash from owners who inherited it or forgot it; sell to consumers who want to camp, park an RV, build a cabin, or live cheap. Biggest profits come from contract-for-deed (we become the bank): e.g. buy $3.5k → sell $1k down + $500/mo × 48 ≈ $25k. ~1 in 5 CFD buyers default around month 4 — we keep every payment AND the land, then resell it." },
      { heading: "Research: county zoning IS the filter", bullets: ["Pick the metro you'll SELL to → list every county 1–3 hrs out (one county removed ≈ 1 hour).", "Call each county zoning dept with 4 questions: camping/RV time limit? (want: none) · minimum build size? (want: none or ≤400 sqft) · mobile homes allowed? · short-term rentals allowed?", "County with NO zoning department = automatic green.", "Tie-breakers: sell-through ratio (sold ÷ listed, near 1:1), Zillow floor under $50k, lake/forest/trail draw.", "Satellite tell: RVs parked on bare land with no house = camping allowed + no HOA in practice."] },
      { heading: "List pull (Direct REI)", bullets: ["Vacant · ≤5.1 ac · assessed value ≤$10k · improvement ≈ $0 · out-of-county (or out-of-state) owner · outside city limits", "Slope: ≥50% of parcel under 15% · not landlocked · FEMA ≤50% · wetlands ≤50% · exclude church/cemetery/state/county/timber/LLC owners", "Scrub in Excel: dedupe by owner + mailing address; kill recent retail sales and neighbors-buying-neighbors; target 100–600 records per pocket."] },
      { heading: "Offer rule — all 3 checks must pass", bullets: ["① Offer ≤ assessed value", "② Offer ≤ ⅓ of your resale estimate (all-in, incl. closing)", "③ Offer ≤ the cheapest active listing in the area (worst case: we list cheapest-on-market and still profit)"], tip: "First call = questions only. Never accept a price on call #1 — even a great one. Research, then call back same day." },
      { heading: "Call handling", body: "Let every seller call go to VOICEMAIL. Reverse-search the number, Ctrl-F the mail list, pull the parcel on the GIS, THEN call back informed. Ask about buildability, utilities, anything they know — then: how much would you like to let it go for? → a range? → what did you pay for it?" },
      { heading: "Dispo (consumer machine)", bullets: ["~90-day average hold; summer fast, Nov–Dec slow.", "Value adds in order: zoning/area knowledge in the listing → pro photos + drone + parcel-map overlay → $2k gravel driveway or cleared pad when the lift is worth it.", "Channels: own website → Facebook Marketplace + up to 20 metro buy/sell groups (half his sales, free) → Craigslist → MLS last resort.", "List in the METRO location, not the parcel town. Multiple posts per parcel: full price / $999-down / monthly-payment number. Small lots in sqft, not acres. Adjacent lots solo AND bundled.", "The $50 buy-now deposit (72 hrs to sign, credited to price) filters out the 90% who flake."] },
      { heading: "Our rec markets", body: "Hot Springs AR (71913, 71909 POA-check, 71901) · Cherokee Village AR (72529/72542 + 72512) · Eufaula OK (74432/74426/74845/74425/74430)." },
    ],
  },
  {
    key: "k_land_goldmine", title: "Goldmine Markets (Lux Blueprint) — find luxury teardown pockets", emoji: "🏰", category: "Land Courses",
    summary: "The 10-step Zillow method to find pockets where builders actively buy old homes to tear down — and the exact list to pull from it.",
    sections: [
      { heading: "🎯 What a goldmine market is", body: "Both at once: builders are actively buying old homes, demolishing, and building new luxury; AND old homes are still cheap enough that owners will sell and builders will pay. Our teardown pulls and infill sniper lists are the SAME lists — this method just sharpens them." },
      { heading: "The 10 steps (Zillow, free)", bullets: ["Filter: year built ≥ 2022 · houses · price min $2M (raise in pricier markets) · REMOVE BOUNDARY.", "Study 3–4 recent new builds: the original sale in the price history = what the BUILDER paid for the teardown.", "Extract the trend: builders' preferred lot size + purchase price range.", "Zestimate check on surrounding old homes: target Zestimates ~$200–300k ABOVE the builder purchase price — that small % discount is why luxury owners say yes.", "Size discipline: if new builds are 6,000 sqft, skip old houses over ~3,000 sqft.", "One pocket at a time — never cross major roads (3+ lanes or yellow lines); values break at those lines.", "Flip to SOLD with the same filters to prove demand.", "Document the pocket: boundary streets, teardown year-built range, builder lot-size range."] },
      { heading: "The list pull (Direct REI translation)", bullets: ["HOUSE list, not vacant land: MLS status = not listed · owner 5+ yrs (sort by sale date after import) · acres/lot size = builder preference · year built max = teardown era + 10 yrs · building sqft max ~2,500 · Est. Market Value = builder price + $200–300k band · map-draw the pocket, never cross the big roads."] },
      { heading: "Where we run it", body: "Brentwood/Oak Hill 37027/37220 (Drees) · Atlanta 30327 Tuxedo/Mt. Paran (Goodwin: $600k–1.4M, ≥0.5 ac, cash, <14 days) · coastal Orange County (Revere, Cefalia, Brad Kinney). MAO method = the How To Analyze A Developer Deal SOP above: dispo price − $100–150k.", tip: "Waterfront only comps waterfront. Buildable area beats paper acreage. Get the seller's number before running comps." },
    ],
  },
  {
    key: "k_land_cheatsheet", title: "Market Research Cheat Sheet — John vs Hunter formulas", emoji: "🗺️", category: "Land Courses",
    summary: "Side-by-side: how to grade an infill zip vs a recreational county before we pull a single lead.",
    sections: [
      { heading: "Infill (research unit = ZIP)", bullets: ["Sold lots last 30 days $50k+ (Zillow) — the demand pulse", "Satellite house-lot-house pattern — the supply pulse", "New construction built this year — the builder pulse (only reliable TX signal)", "Months of inventory: active ÷ monthly sold — high number = saturated, walk away (Canyon Lake: 677 active ÷ 20/mo ≈ 33 months → demoted)"] },
      { heading: "Recreational (research unit = COUNTY)", bullets: ["1–3 hrs from the metro you sell to", "4-question county zoning call (camping limit · min build size · mobile homes · STR) — no-zoning county = green", "Sell-through ratio near 1:1 · Zillow floor under $50k", "Income/population gap: low-income rural county next to high-income metro = the spread", "RVs on bare land via satellite = freedom confirmed"] },
      { heading: "Luxury teardown (research unit = POCKET)", bullets: ["$2M+ new builds present (or kill) · builder paid X (price history) → hunt Zestimates X + $200–300k · never cross main roads or water lines"] },
      { heading: "Non-disclosure states", body: "TX, NM, ID, UT, MT hide sold prices — Zillow sold counts are unreliable there. Judge by new-construction counts + direct builder calls instead." },
    ],
  },
];
