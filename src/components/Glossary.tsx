"use client";

import { useMemo, useState } from "react";

// Real-estate / wholesaling terms the team should know — the same language we use in
// the scripts and on the underwriting calculator. Keep definitions short and plain.
// `eg` is an optional example sentence (used heavily by the Lux Blueprint set).
type Tag = "value" | "exit" | "money" | "deal" | "people" | "process" | "lux";
type Term = { term: string; abbr?: string; def: string; eg?: string; tag: Tag };
const TERMS: Term[] = [
  { term: "ARV", abbr: "After Repair Value", def: "What a property is worth AFTER it's fully fixed up. The flipper's resale number — used for cash/assignment offers.", tag: "value" },
  { term: "EMV", abbr: "Estimated Market Value", def: "Best estimate of what something sells for as-is today — used for LAND and lots, where there's no 'repair' to add value.", tag: "value" },
  { term: "Similar-condition value", abbr: "As-is value", def: "What the house is worth in its CURRENT condition (not repaired). The basis for a novation list price — we're not chasing ARV.", tag: "value" },
  { term: "Comps", abbr: "Comparables", def: "Recent CLOSED sales of similar nearby properties. Hard facts that back up a value — never a guess.", tag: "value" },
  { term: "DOM", abbr: "Days on Market", def: "How many days a listing sat before selling. Low DOM = hot area; high DOM = price it conservatively.", tag: "value" },
  { term: "MAO", abbr: "Max Allowable Offer", def: "The highest price we can offer the seller and still hit our minimum fee. We open below it (the anchor) and negotiate up to it — never past it.", tag: "deal" },

  { term: "Assignment", def: "We put a property under contract and sell (assign) that contract to an end buyer for a fee. We never actually buy it.", tag: "exit" },
  { term: "Novation", def: "We list the seller's house on the MLS at similar-condition value, cover the seller's closing/commission, and keep the spread. No holding — a retail buyer closes it.", tag: "exit" },
  { term: "Wholetail", def: "Light-rehab flip — buy, do minimal cleanup, and resell retail. Between wholesaling and a full flip.", tag: "exit" },
  { term: "Double close", def: "Two back-to-back closings (we buy, then immediately resell) instead of assigning — used when we don't want the fee disclosed.", tag: "exit" },
  { term: "Subject-to", abbr: "Sub-to", def: "Buyer takes over the seller's existing mortgage payments; the loan stays in the seller's name. A creative/terms deal.", tag: "exit" },
  { term: "Seller finance", def: "The seller acts as the bank — buyer pays them over time instead of getting a loan. A creative/terms deal.", tag: "exit" },

  { term: "Assignment fee", def: "Our profit on an assignment — what the end buyer pays us above the seller's price.", tag: "money" },
  { term: "Spread", def: "The gap between what we contract a property for and what we sell it for — that gap is our money.", tag: "money" },
  { term: "Earnest money", abbr: "EMD", def: "A small good-faith deposit the buyer puts down to show they're serious. Held in escrow.", tag: "money" },
  { term: "Proof of funds", abbr: "POF", def: "A document showing a buyer actually has the cash to close.", tag: "money" },
  { term: "Hard money", def: "Short-term, higher-interest loan from a lender that funds flips fast, based on the deal not the borrower.", tag: "money" },
  { term: "Private money", def: "A loan from an individual investor (not a bank) — often cheaper/more flexible than hard money.", tag: "money" },
  { term: "Gap funding", def: "Money that covers the difference between what hard money lends and the total cash needed.", tag: "money" },
  { term: "Holding / carrying costs", def: "What it costs to own a property while you hold it — taxes, insurance, utilities, loan interest, HOA.", tag: "money" },
  { term: "Closing costs", def: "Fees paid at closing — title, escrow, transfer taxes, recording. Split between buyer and seller depending on the deal.", tag: "money" },
  { term: "PITI", def: "Principal, Interest, Taxes, Insurance — the full monthly cost of a mortgage payment.", tag: "money" },
  { term: "HOA", abbr: "Homeowners Association", def: "Monthly/annual dues on some properties — a real carrying cost we deduct in the numbers.", tag: "money" },
  { term: "Cash for keys", def: "Paying an occupant or tenant to move out voluntarily instead of evicting — an extra deal cost.", tag: "money" },

  { term: "Escrow", def: "A neutral third party that holds funds/documents and handles the closing so neither side gets cheated.", tag: "process" },
  { term: "Title", def: "Legal proof of ownership. A title company makes sure it's clean (no surprise claims) before closing.", tag: "process" },
  { term: "Lien", def: "A legal claim against a property for a debt (taxes, contractor, judgment). Must be cleared before clean title.", tag: "process" },
  { term: "Contingency", def: "A condition in the contract that lets a party back out (inspection, financing, title). Our exits to walk if needed.", tag: "process" },
  { term: "Due diligence", abbr: "Inspection period", def: "The window after going under contract to verify condition, title, and numbers before we're locked in.", tag: "process" },
  { term: "Purchase agreement", abbr: "PSA", def: "The contract between buyer and seller — price, terms, timeline. What we assign.", tag: "process" },
  { term: "EMD", def: "See Earnest money — the good-faith deposit.", tag: "process" },

  { term: "Disposition", abbr: "Dispo", def: "Selling the deal — marketing a contract to our buyer list and getting it assigned/closed. (Marie & Sharyn.)", tag: "people" },
  { term: "Acquisition", abbr: "AQ", def: "Getting the deal — talking to sellers, making offers, getting contracts signed. (Michelle.)", tag: "people" },
  { term: "Buyer's list", def: "Our vetted list of cash buyers, flippers, and developers we blast new deals to.", tag: "people" },
  { term: "Cash buyer", def: "An investor who buys without a loan — fast, reliable closings. Our best end buyers.", tag: "people" },
  { term: "Fix & flipper", def: "A buyer who rehabs and resells retail. Values ARV and repair costs.", tag: "people" },
  { term: "Developer", def: "A buyer who builds — tears down/subdivides/develops land. Values lot size, zoning, EMV.", tag: "people" },
  { term: "Gatekeeper", def: "The person (assistant, receptionist) between us and the decision maker. Get past them politely.", tag: "people" },
  { term: "Decision maker", def: "The person who can actually say yes to a deal — who we need on the phone.", tag: "people" },
  { term: "Motivated seller", def: "A seller with a real reason to sell fast (distress, life change). Where our best deals come from.", tag: "people" },

  { term: "Buy box", def: "A buyer's exact criteria — areas, price range, property type, condition. Match deals to it instantly.", tag: "deal" },
  { term: "Off-market", def: "A deal not listed publicly on the MLS — sourced directly. Where wholesalers live.", tag: "deal" },
  { term: "On-market / MLS", def: "Listed publicly on the Multiple Listing Service. ON MARKET ≠ sent to our buyers — it just means it's listed.", tag: "deal" },
  { term: "Anchor", def: "Our opening offer — set below the MAO so we have room to negotiate UP to the max.", tag: "deal" },
  { term: "Distressed property", def: "A home in poor condition or whose owner is under pressure — prime wholesale target.", tag: "deal" },
  { term: "Pre-foreclosure", def: "Owner is behind on the mortgage but hasn't lost the home yet — often motivated to sell.", tag: "deal" },
  { term: "Probate", def: "A property going through the court process after an owner's death — heirs often want a fast cash sale.", tag: "deal" },
  { term: "Equity", def: "The portion of a property the owner actually owns — value minus what's owed. More equity = more room to deal.", tag: "deal" },

  // ===== Luxury (Lux Blueprint Academy) — high-end development + escrow vocabulary =====
  { term: "Letter of Intent", abbr: "LOI", def: "A non-binding outline of deal terms used to frame a luxury transaction before contracts.", eg: "We sent an LOI at $4.2M with a 30-day close and no financing contingency.", tag: "lux" },
  { term: "Off-Market (Luxury)", def: "A high-end property sold privately, off the MLS, for discretion or pricing leverage.", eg: "The seller prefers an off-market deal to avoid public price discovery.", tag: "lux" },
  { term: "Assignment (Luxury)", def: "Transferring contract rights to another buyer — often an entity or capital partner — for a fee that reflects the upside you created.", tag: "lux" },
  { term: "Addendum", def: "A written change to a contract, commonly used for entity swaps or timeline adjustments.", eg: "We used an addendum to change the buyer to our holding company.", tag: "lux" },
  { term: "Effective Date", def: "The date a fully executed contract becomes binding — it starts your due-diligence and entitlement clocks.", tag: "lux" },
  { term: "Double Close", abbr: "Simultaneous Closing", def: "Two back-to-back closings (you buy A→B, then sell B→C) so your spread stays PRIVATE — neither seller nor buyer sees your profit. Best on large luxury spreads. You pay title/escrow on your side; ask for investor rates.", eg: "$1.5M in, $1.7M out — the $200K spread is invisible to both sides.", tag: "lux" },
  { term: "Close of Escrow", abbr: "COE", def: "The moment legal ownership transfers and funds are released.", eg: "We're targeting COE immediately after city approval.", tag: "lux" },
  { term: "Title Commitment", def: "A preliminary report outlining ownership and any restrictions affecting luxury use (e.g. height limits).", tag: "lux" },
  { term: "Title Insurance", def: "Protection against unknown ownership or lien issues. On luxury deals, extended coverage is standard.", tag: "lux" },
  { term: "Earnest Money Deposit (Luxury)", abbr: "EMD", def: "Good-faith deposit to lock up a deal. Standard is 1% of price; negotiate lower (0.5% or less) to limit risk.", eg: "On a $1M contract, standard EMD is $10K — we negotiated $5K.", tag: "lux" },
  { term: "Zoning", def: "Rules governing the use, density, and form of a development.", eg: "Zoning allows one ultra-luxury estate or two high-end residences.", tag: "lux" },
  { term: "Entitlements", def: "All approvals required to legally build a luxury product — often where the value is created.", eg: "The value creation is entirely in the entitlements.", tag: "lux" },
  { term: "Variance", def: "Special permission to deviate from zoning rules.", eg: "We pursued a variance for increased height to capture views.", tag: "lux" },
  { term: "Setbacks", def: "Required distances between structures and the property lines.", eg: "Setback relief let us expand the main living space.", tag: "lux" },
  { term: "Easement", def: "A legal right for utilities or access that can impact the design.", eg: "The utility easement dictated the garage placement.", tag: "lux" },
  { term: "Spec Home", abbr: "Luxury Spec", def: "A high-end home built without a buyer, designed for resale.", eg: "This is a $9M luxury spec targeting cash buyers.", tag: "lux" },
  { term: "Custom Home", def: "A residence designed for a specific end user.", eg: "The buyer is doing a full custom with imported finishes.", tag: "lux" },
  { term: "Horizontal Development", def: "Infrastructure work — grading, utilities, and access — before vertical build.", tag: "lux" },
  { term: "Vertical Development", def: "Construction of the luxury structure itself.", eg: "Vertical construction is projected at $650 per square foot.", tag: "lux" },
  { term: "Hard Costs", def: "Physical construction expenses — materials and labor.", eg: "Hard costs are elevated due to stone, steel, and glass.", tag: "lux" },
  { term: "Soft Costs", def: "Design, engineering, permitting, and professional fees.", tag: "lux" },
  { term: "Capital Stack", def: "All the sources of money in a project — debt plus equity.", eg: "The stack includes private equity and a construction loan.", tag: "lux" },
  { term: "Construction Loan", def: "Short-term financing to build, sized to cost (loan-to-cost / LTC).", eg: "The bank approved a 65% LTC construction loan.", tag: "lux" },
  { term: "Draw Schedule", def: "Planned release of loan funds at construction milestones.", eg: "Draws are tied to milestone inspections.", tag: "lux" },
  { term: "Interest Carry", def: "Interest paid on financing during development.", tag: "lux" },
  { term: "IRR", abbr: "Internal Rate of Return", def: "The annualized return over the life of the deal.", eg: "The deal pencils to a 28% IRR.", tag: "lux" },
  { term: "Exit Strategy", def: "The planned way to profit from a project — typically a retail sale to a cash buyer.", tag: "lux" },
  { term: "Entitlement Risk", def: "The risk that build approvals are delayed or denied. Often baked into the purchase discount.", tag: "lux" },
  { term: "Market Risk", def: "Risk tied to luxury buyer demand — scarcity at the top end can insulate you.", tag: "lux" },
  { term: "Absorption Rate", def: "How fast luxury homes sell at a given price point.", eg: "Absorption remains strong above $8M.", tag: "lux" },
  { term: "Stabilized", def: "A property operating at its expected performance.", tag: "lux" },
];

const TAGS: Record<Tag, { label: string; cls: string }> = {
  value: { label: "Value", cls: "bg-emerald-100 text-emerald-700" },
  exit: { label: "Exit", cls: "bg-sky-100 text-sky-700" },
  money: { label: "Money", cls: "bg-amber-100 text-amber-700" },
  deal: { label: "Deal", cls: "bg-violet-100 text-violet-700" },
  people: { label: "People", cls: "bg-rose-100 text-rose-700" },
  process: { label: "Process", cls: "bg-slate-200 text-slate-700" },
  lux: { label: "Luxury", cls: "bg-yellow-100 text-yellow-800" },
};
const CATS: { key: Tag | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "lux", label: "✨ Luxury (Lux Blueprint)" },
  { key: "value", label: "Value" },
  { key: "exit", label: "Exit" },
  { key: "money", label: "Money" },
  { key: "deal", label: "Deal" },
  { key: "people", label: "People" },
  { key: "process", label: "Process" },
];

export default function Glossary() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Tag | "all">("all");
  const sorted = useMemo(() => [...TERMS].sort((a, b) => a.term.localeCompare(b.term)), []);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sorted.filter((t) => {
      if (cat !== "all" && t.tag !== cat) return false;
      if (needle && !`${t.term} ${t.abbr ?? ""} ${t.def} ${t.eg ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [q, cat, sorted]);

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 Search terms — ARV, novation, double close, entitlements…"
        className="mb-3 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {CATS.map((c) => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${cat === c.key ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((t) => {
          const tg = TAGS[t.tag];
          return (
            <div key={`${t.tag}-${t.term}`} className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
              <div className="mb-0.5 flex items-baseline gap-2">
                <span className="font-bold text-slate-800">{t.term}</span>
                {t.abbr && <span className="text-[11px] italic text-slate-400">{t.abbr}</span>}
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${tg.cls}`}>{tg.label}</span>
              </div>
              <p className="text-[13px] leading-snug text-slate-600">{t.def}</p>
              {t.eg && <p className="mt-1 text-[12px] italic leading-snug text-slate-400">e.g. {t.eg}</p>}
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-slate-400">No terms match “{q}”.</p>}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">{rows.length} of {TERMS.length} terms · the same language we use in the scripts and the underwriting calculator.</p>
    </div>
  );
}
