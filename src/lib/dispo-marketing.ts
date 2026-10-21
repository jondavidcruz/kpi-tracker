// 📣 Per-deal marketing SOP checklist (Jon 2026-10-20). The Marie audit showed
// deals weren't being marketed consistently. Every dispo deal now carries the same
// active + passive channel checklist so nothing is skipped. Stored on
// CrmOpportunity.formData.__marketing (string[] of done step keys) — no migration.

export type MarketingOwner = "sharyn" | "marie";
export type MarketingStep = { key: string; label: string; group: "active" | "passive"; owner: MarketingOwner; hint?: string };

// Ownership (Jon 2026-10-21): Sharyn = all ACTIVE outreach (calls, emails, texts,
// arming the cascade — her phone/outreach strength). Marie = all POSTING / LISTING
// on the platforms (passive + the FB-group posting — her data/organization strength).
export const MARKETING_STEPS: MarketingStep[] = [
  // ACTIVE — we reach out (Sharyn)
  { key: "send_developers", label: "Send deal to matched vetted developers", group: "active", owner: "sharyn", hint: "Use the deal's Smart Match → attach + send top-down" },
  { key: "call_agents", label: "Call buyer agents in the area", group: "active", owner: "sharyn", hint: "From DS: Buyer Agents — who has buyers there?" },
  { key: "email_buyers", label: "Email blast to vetted buyers", group: "active", owner: "sharyn" },
  { key: "text_buyers", label: "Text blast to vetted buyers", group: "active", owner: "sharyn" },
  { key: "arm_cascade", label: "Arm the buyer cascade / ping-tree", group: "active", owner: "sharyn" },
  // POSTING — list it so buyers find it (Marie)
  { key: "fb_groups", label: "Post in FB land-investor groups", group: "passive", owner: "marie" },
  { key: "landsofamerica", label: "List on Lands of America / Land.com", group: "passive", owner: "marie" },
  { key: "marketplace", label: "List on Facebook Marketplace", group: "passive", owner: "marie" },
  { key: "craigslist", label: "List on Craigslist", group: "passive", owner: "marie" },
  { key: "company_site", label: "List on the Freedom Offers site", group: "passive", owner: "marie" },
];

export const OWNER_LABEL: Record<MarketingOwner, string> = { sharyn: "Sharyn", marie: "Marie" };

export function readMarketingDone(formData: unknown): string[] {
  const fd = formData as Record<string, unknown> | null;
  const raw = fd?.__marketing;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}
