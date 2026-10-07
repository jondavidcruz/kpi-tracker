// Structured discovery forms (Jon 2026-10-07: "specific questions we want to
// ask" — modeled on his GHL custom-field sections, simplified). Three built-in
// templates; answers live in CrmOpportunity.formData {formKey: {field: value}}.
export type FormField =
  | { key: string; label: string; type: "text" | "textarea"; hint?: string }
  | { key: string; label: string; type: "select"; options: string[] }
  | { key: string; label: string; type: "checks"; options: string[] };

export type CrmForm = { key: string; name: string; emoji: string; fields: FormField[] };

export const CRM_FORMS: CrmForm[] = [
  {
    key: "property", name: "Property Details", emoji: "🏡",
    fields: [
      { key: "ptype", label: "Property type", type: "select", options: ["Vacant land", "House", "Mobile/MH", "Multi-family", "Commercial", "Other"] },
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
    ],
  },
  {
    key: "land", name: "Land Details", emoji: "🏞",
    fields: [
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
      { key: "confidence", label: "Deal confidence", type: "select", options: ["🔥 Hot — ready now", "Warm — needs the right number", "Cold — long nurture"] },
    ],
  },
];
