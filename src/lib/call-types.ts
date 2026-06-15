// The kinds of call we score. Each has its own script + scoring emphasis.
export interface CallType { key: string; label: string; group: "Acquisitions" | "Dispositions" }

export const CALL_TYPES: CallType[] = [
  { key: "aq_discovery", label: "AQ: Discovery / Appt Set Call", group: "Acquisitions" },
  { key: "aq_luxury_process", label: "AQ: Luxury Process Call", group: "Acquisitions" },
  { key: "aq_traditional_process", label: "AQ: Traditional Process Call", group: "Acquisitions" },
  { key: "aq_offer", label: "AQ: Offer Call", group: "Acquisitions" },
  { key: "aq_negotiation", label: "AQ: Negotiation Call", group: "Acquisitions" },
  { key: "aq_contract", label: "AQ: Contract Call", group: "Acquisitions" },
  { key: "ds_seller_intro", label: "DS: Seller Intro Call", group: "Dispositions" },
  { key: "ds_agent_listing_intro", label: "DS: Agent Listing Intro Call", group: "Dispositions" },
  { key: "ds_agent_buyer_intro", label: "DS: Agent Buyer Intro Call", group: "Dispositions" },
  { key: "ds_agent_pocket_deal", label: "DS: Agent Pocket Deal Call", group: "Dispositions" },
  { key: "ds_flipper_intro", label: "DS: Flipper Intro Call", group: "Dispositions" },
  { key: "ds_developer_intro", label: "DS: Developer Intro Call", group: "Dispositions" },
  { key: "ds_seller_reduction", label: "DS: Seller Reduction Call", group: "Dispositions" },
  { key: "ds_buyer_offer", label: "DS: Buyer Offer Call", group: "Dispositions" },
];

export function callTypeLabel(key: string): string {
  return CALL_TYPES.find((c) => c.key === key)?.label ?? "General call";
}
