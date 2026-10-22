// Structured discovery forms (Jon 2026-10-07: "specific questions we want to
// ask" — modeled on his GHL custom-field sections). Jon's rep ask (same day):
// Home and Land are PARALLEL forms that both OPEN with the same core block
// (address, APN, motivation, price, timeline…), then branch — Land digs into
// zoning/utilities, Home digs into the majors (HVAC, water heater, roof…).
// Answers live in CrmOpportunity.formData {formKey: {field: value}}.
export type FormField =
  | { key: string; label: string; type: "text" | "textarea"; hint?: string }
  | { key: string; label: string; type: "select"; options: string[] }
  | { key: string; label: string; type: "checks"; options: string[] };

export type CrmForm = { key: string; name: string; emoji: string; fields: FormField[] };

// Land buyer sell-points — shared by the Land Details form + the CRM feature filter.
export const LAND_FEATURES = ["Waterfront / lake frontage", "Water view", "Creek / river on property", "Pond on property", "Paved road frontage", "Dirt / gravel road access", "Corner lot", "Cleared / build-ready", "Wooded / treed", "Flat / level", "Gentle slope", "Mountain / hill views", "Fenced", "Flood zone", "Wetlands", "Mineral rights included", "Off-grid", "Gated community"];

// Shared opener — identical on Home and Land so reps build one habit.
const CORE: FormField[] = [
  { key: "address", label: "Property address for sale", type: "text", hint: "Confirm the address — any other properties they need to sell?" },
  { key: "apn", label: "APN", type: "text" },
  { key: "urgency", label: "Ready to sell today?", type: "select", options: ["Yes — hard offer & contract today", "Depends on offer — soft offer today", "No — get details & nurture"] },
  { key: "motivation", label: "Motivation", type: "textarea", hint: "Dig deep — why sell, why now, how does it feel?" },
  { key: "duration", label: "How long have they dealt with this?", type: "text" },
  { key: "agent", label: "Tried an agent / already listed?", type: "text" },
  { key: "wants", label: "Amount they want/need $", type: "text" },
  { key: "offers", label: "Offers they've received", type: "text" },
  { key: "creative", label: "Open to creative? (Sub2 / seller finance)", type: "textarea" },
  { key: "occupancy", label: "Occupancy", type: "select", options: ["Vacant", "Owner-occupied", "Tenant", "Squatter", "Unknown"] },
  { key: "timeline", label: "Vacancy / close timeline", type: "text" },
];

export const CRM_FORMS: CrmForm[] = [
  {
    key: "property", name: "Home Details", emoji: "🏡",
    fields: [
      ...CORE,
      // the majors — what actually moves a home offer
      { key: "yearBuilt", label: "Year built", type: "text" },
      { key: "sqftBedsBaths", label: "Sqft / beds / baths", type: "text" },
      { key: "roof", label: "Roof — age & condition", type: "text" },
      { key: "hvac", label: "HVAC — age, does it work?", type: "text" },
      { key: "waterHeater", label: "Water heater — age & type", type: "text" },
      { key: "foundation", label: "Foundation issues? (cracks, settling)", type: "text" },
      { key: "plumbingElectric", label: "Plumbing / electrical — updated or original?", type: "text" },
      { key: "kitchenBaths", label: "Kitchen & baths — last updated?", type: "text" },
      { key: "repairs", label: "What repairs would it need to sell retail?", type: "textarea", hint: "Their words — then your $ guess" },
      { key: "tenantLease", label: "If tenant: rent, lease end, paying?", type: "text" },
      { key: "condition", label: "Overall condition", type: "select", options: ["Move-in ready", "Light cosmetic", "Full cosmetic", "Heavy rehab", "Teardown"] },
    ],
  },
  {
    key: "land", name: "Land Details", emoji: "🏞",
    fields: [
      ...CORE,
      { key: "lot", label: "Lot size", type: "text" },
      // 🎯 Buy-box matching fields (Jon 2026-10-20) — captured at intake so the deal
      // auto-marries to developer/agent buy-boxes on the Smart Match.
      { key: "acreage", label: "Acreage (exact #)", type: "text", hint: "e.g. 2.5 — the single most-asked buy-box number" },
      { key: "legalAccess", label: "Legal / road access", type: "select", options: ["Paved road frontage", "Dirt / gravel road", "Easement access", "⚠️ Landlocked — NO legal access", "Unknown"] },
      { key: "easements", label: "Easements?", type: "select", options: ["None known", "Utility easement", "Access easement", "Other — see notes"] },
      { key: "topography", label: "Topography", type: "select", options: ["Flat / level", "Gentle slope", "Steep / hilly", "Mixed", "Unknown"] },
      { key: "zoning", label: "Zoned for?", type: "text" },
      { key: "floodZone", label: "Flood zone?", type: "select", options: ["No / Zone X", "Partial", "Yes — in a flood zone", "Unknown"] },
      { key: "wetlands", label: "Wetlands?", type: "select", options: ["None", "Partial", "Significant", "Unknown"] },
      { key: "hazard", label: "Other hazards? (fire, etc.)", type: "text" },
      { key: "build", label: "Can you build? Min/max size?", type: "text" },
      { key: "rv", label: "RV parking? Duration?", type: "text" },
      { key: "camp", label: "Camping? Duration?", type: "text" },
      { key: "str", label: "STR / AirBnB allowed?", type: "text" },
      { key: "develop", label: "What can be developed?", type: "text" },
      { key: "hoa", label: "HOA/POA restrictions?", type: "text" },
      { key: "special", label: "Anything special about the land?", type: "textarea" },
      // 🏞 Buyer sell-points (Jon 2026-10-20) — checked uniformly so Marie can find
      // e.g. "waterfront" fast (search picks these up; one-click filter-ready).
      { key: "features", label: "Land features (buyer sell-points)", type: "checks", options: LAND_FEATURES },
      { key: "utilities", label: "Utilities & access", type: "checks", options: ["Street/road access", "City water", "Well", "City electric", "Utility lines nearby", "City sewage", "Septic", "No water", "No sewage", "No electric", "Near water/lake", "Near hiking/rec", "Near RVs/houses"] },
    ],
  },
  {
    key: "financial", name: "Financials & Offer", emoji: "💰",
    fields: [
      { key: "owed", label: "Amount owed / mortgage balance $", type: "text" },
      { key: "liens", label: "Liens / back taxes?", type: "text" },
      { key: "payment", label: "Monthly payment (PITI) $", type: "text" },
      { key: "behind", label: "Behind on payments?", type: "select", options: ["No", "Yes — under 3 months", "Yes — 3+ months", "In foreclosure"] },
      { key: "creativeTerms", label: "Creative terms they'd take", type: "textarea", hint: "Price if we pay over time? Down payment needed? Monthly?" },
      { key: "bottomLine", label: "Bottom-line cash number $", type: "text" },
      // offer outcome (Jon 2026-10-08): track what WE offered vs what the seller
      // said — powers the negotiation playbook + accepted-vs-offered view.
      { key: "ourOffer", label: "Our offer $", type: "text", hint: "What we actually offered (from the underwriting above)" },
      { key: "sellerResponse", label: "Seller response to our offer", type: "select", options: ["— not offered yet", "✅ Accepted", "🔁 Countered", "❌ Rejected", "🤔 Thinking about it"] },
      { key: "sellerNumber", label: "Seller's counter / accepted $", type: "text" },
      { key: "confidence", label: "Deal confidence", type: "select", options: ["🔥 Hot — ready now", "Warm — needs the right number", "Cold — long nurture"] },
    ],
  },
];

// 🏗/🧑‍💼 Dispo buyer-NETWORK forms (Jon 2026-10-20). Developers + buyer agents are
// NOT sellers — their lead cards ask buy-box / relationship questions, never the
// seller discovery above. Answers save to the opp's formData like any CRM form.
export const DISPO_DEV_FORM: CrmForm = {
  key: "dev_buybox", name: "Developer Buy-Box", emoji: "🏗",
  fields: [
    { key: "relationship", label: "Relationship status", type: "select", options: ["New — not contacted", "Researching them", "Reached out", "Following up", "Vetted — good buyer", "Not a fit"] },
    { key: "buyCounties", label: "Counties / areas they buy", type: "textarea", hint: "The goldmine — where do they actually buy? One per line." },
    { key: "landTypes", label: "What land do they buy?", type: "checks", options: ["Infill lots", "Acreage / rural", "Subdividable", "Entitled / paper lots", "Teardown", "Waterfront", "Agricultural", "Recreational"] },
    { key: "lotSize", label: "Lot size range (acres)", type: "text", hint: "e.g. 0.25–5 ac" },
    { key: "priceRange", label: "Price range per deal $", type: "text", hint: "e.g. $50k–$500k" },
    { key: "closeSpeed", label: "How fast can they close?", type: "select", options: ["Cash — under 14 days", "15–30 days", "30–60 days", "Needs financing / longer"] },
    { key: "volume", label: "Deals / lots per year", type: "text" },
    { key: "requirements", label: "Utilities / zoning requirements", type: "text" },
    { key: "dealBreakers", label: "Deal breakers", type: "textarea", hint: "wetlands, no access, power lines…" },
    { key: "decisionMaker", label: "Who's the decision maker?", type: "text" },
    { key: "proofOfFunds", label: "Proof of funds?", type: "select", options: ["Yes — verified", "Claimed, not verified", "No / unknown"] },
  ],
};
export const DISPO_AGENT_FORM: CrmForm = {
  key: "agent_profile", name: "Buyer-Agent Profile", emoji: "🧑‍💼",
  fields: [
    { key: "relationship", label: "Relationship status", type: "select", options: ["New — not contacted", "Reached out", "Following up", "Active partner", "Not a fit"] },
    { key: "brokerage", label: "Brokerage / company", type: "text" },
    { key: "areas", label: "Areas they cover", type: "textarea", hint: "Counties / cities they list + sell in" },
    { key: "buyerTypes", label: "Buyers they represent", type: "text", hint: "builders, developers, investors, funds…" },
    { key: "priceRange", label: "Price range their buyers want $", type: "text" },
    { key: "bestContact", label: "Best way to reach them", type: "select", options: ["Call", "Text", "Email"] },
    { key: "sendsDeals", label: "Will they bring buyers to our deals?", type: "select", options: ["Yes — actively", "Maybe", "Not yet"] },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};
export const DISPO_DEV_FORMS: CrmForm[] = [DISPO_DEV_FORM];
export const DISPO_AGENT_FORMS: CrmForm[] = [DISPO_AGENT_FORM];

// 🧩 The ONE rule for which discovery forms a lead shows — driven by its PIPELINE
// (= lead type), so buyer agents + developers get buyer questions and sellers get
// seller questions, never seller-default-for-everyone (Jon 2026-10-20). Used by
// both the full lead page and the quick-view so they always match.
export function formsForPipeline(pipeline: string | null | undefined): CrmForm[] {
  const p = (pipeline ?? "").toLowerCase();
  if (p === "ds: unvetted developers") return DISPO_DEV_FORMS;
  if (p === "ds: buyer agents") return DISPO_AGENT_FORMS;
  // Seller / deal pipelines: Land Details only where it's a land pipeline.
  const isLandPipe = /\bland\b/.test(p);
  return CRM_FORMS.filter((f) => f.key !== "land" || isLandPipe);
}
