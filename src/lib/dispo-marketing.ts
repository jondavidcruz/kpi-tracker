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
  // After the vetted developers, work the comps (Jon 2026-10-26): owners of recently SOLD
  // comparable lots nearby who are LLCs or agents are almost always cash buyers / builders.
  { key: "sold_comps_llc", label: "Contact nearby sold-comp owners (LLCs / agents)", group: "active", owner: "sharyn", hint: "Pull recent SOLD comps near this lot → the LLC / agent buyers = likely cash buyers" },
  { key: "call_agents", label: "Call buyer agents in the area", group: "active", owner: "sharyn", hint: "From DS: Buyer Agents — who has buyers there?" },
  { key: "email_buyers", label: "Email blast to vetted buyers", group: "active", owner: "sharyn" },
  { key: "text_buyers", label: "Text blast to vetted buyers", group: "active", owner: "sharyn" },
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

/** Every marketing channel done? Used by the "Sent to buyers" SOP gate, which now mirrors
 *  this checklist instead of keeping its own duplicate list (Jon 2026-10-29). */
export function marketingComplete(steps: MarketingStep[], done: string[]): boolean {
  if (!steps.length) return false;
  const set = new Set(done);
  return steps.every((s) => set.has(s.key));
}
