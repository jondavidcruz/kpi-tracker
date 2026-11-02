// 📍 Where a seller lead was generated. One canonical list, shared by the CRM quick-view
// edit panel and the full lead page so the dropdown reads the same everywhere (Jon 2026-11-02).
// Stored per opportunity in formData.__leadSource (no schema column).
export type LeadSourceOption = { value: string; label: string; hint: string };

export const LEAD_SOURCES: LeadSourceOption[] = [
  { value: "D4D",       label: "D4D — Driving for Dollars", hint: "Self-sourced by the acquisitions rep → 60/40 split (we keep 60%, they get 40%)" },
  { value: "PPL",       label: "PPL — Pay-per-lead",        hint: "Inbound, purchased lead source" },
  { value: "Website",   label: "Website",                   hint: "Organic traffic funnel" },
  { value: "Cold Call", label: "Cold Call",                 hint: "From our dialer" },
  { value: "Email",     label: "Email",                     hint: "Outbound email" },
  { value: "SMS",       label: "SMS / Text",                hint: "Outbound text" },
  { value: "Other",     label: "Other",                     hint: "" },
];

/** The short explanation for a stored lead-source value (empty string if unknown/none). */
export function leadSourceHint(value: string | undefined | null): string {
  if (!value) return "";
  return LEAD_SOURCES.find((s) => s.value === value)?.hint ?? "";
}
