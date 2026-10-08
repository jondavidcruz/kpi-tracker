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
      { key: "zoning", label: "Zoned for?", type: "text" },
      { key: "hazard", label: "Hazardous zoning? (flood, fire…)", type: "text" },
      { key: "build", label: "Can you build? Min/max size?", type: "text" },
      { key: "rv", label: "RV parking? Duration?", type: "text" },
      { key: "camp", label: "Camping? Duration?", type: "text" },
      { key: "str", label: "STR / AirBnB allowed?", type: "text" },
      { key: "develop", label: "What can be developed?", type: "text" },
      { key: "hoa", label: "HOA/POA restrictions?", type: "text" },
      { key: "special", label: "Anything special about the land?", type: "textarea" },
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
