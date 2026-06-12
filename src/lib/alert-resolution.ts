// Shared vocabulary + helpers for resolving KPI alerts with a documented reason.
// Keeping the categories in one place means the resolve form, the trends rollup,
// and the PIP/excuse logic all speak the same language.

export interface ReasonOption {
  key: string;
  label: string;
  /** excused reasons don't count as a real miss (no PIP, excluded from trends) */
  excused?: boolean;
  hint: string;
}

export const REASON_OPTIONS: ReasonOption[] = [
  { key: "leads", label: "Low lead volume", hint: "Not enough leads / list to work — a supply problem, not effort." },
  { key: "tech", label: "Tech / internet", hint: "Dialer, CRM, power, or connection issue blocked the work." },
  { key: "training", label: "Training gap", hint: "Skill or process not yet dialed in — coachable." },
  { key: "effort", label: "Effort / focus", hint: "The activity simply wasn't put in. Accountability conversation." },
  { key: "process", label: "Process / other", hint: "Workflow, handoff, or something outside the usual buckets." },
  { key: "excused", label: "Excused (PTO / holiday / outage)", excused: true, hint: "A legitimate non-working reason. Won't count toward a PIP or trends." },
];

export function reasonLabel(key: string | null | undefined): string {
  if (!key) return "—";
  if (key === "recovered") return "Recovered on its own";
  return REASON_OPTIONS.find((r) => r.key === key)?.label ?? key;
}

export function isExcusedReason(key: string | null | undefined): boolean {
  return !!key && (REASON_OPTIONS.find((r) => r.key === key)?.excused ?? false);
}
