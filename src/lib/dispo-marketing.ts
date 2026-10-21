// 📣 Per-deal marketing SOP checklist (Jon 2026-10-20). The Marie audit showed
// deals weren't being marketed consistently. Every dispo deal now carries the same
// active + passive channel checklist so nothing is skipped. Stored on
// CrmOpportunity.formData.__marketing (string[] of done step keys) — no migration.

export type MarketingStep = { key: string; label: string; group: "active" | "passive"; hint?: string };

export const MARKETING_STEPS: MarketingStep[] = [
  // ACTIVE — we reach out
  { key: "send_developers", label: "Send deal to matched vetted developers", group: "active", hint: "Use the deal's Smart Match → attach + send top-down" },
  { key: "call_agents", label: "Call buyer agents in the area", group: "active", hint: "From DS: Buyer Agents — who has buyers there?" },
  { key: "email_buyers", label: "Email blast to vetted buyers", group: "active" },
  { key: "text_buyers", label: "Text blast to vetted buyers", group: "active" },
  { key: "arm_cascade", label: "Arm the buyer cascade / ping-tree", group: "active" },
  { key: "fb_groups", label: "Post in FB land-investor groups", group: "active" },
  // PASSIVE — we list so buyers find it
  { key: "landsofamerica", label: "List on Lands of America / Land.com", group: "passive" },
  { key: "marketplace", label: "List on Facebook Marketplace", group: "passive" },
  { key: "craigslist", label: "List on Craigslist", group: "passive" },
  { key: "company_site", label: "List on the Freedom Offers site", group: "passive" },
];

export function readMarketingDone(formData: unknown): string[] {
  const fd = formData as Record<string, unknown> | null;
  const raw = fd?.__marketing;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}
