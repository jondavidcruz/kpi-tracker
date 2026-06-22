// Expense categories for the C-suite P&L tracker (mirrors the spreadsheet).
export const EXPENSE_CATEGORIES = [
  { key: "payroll", label: "Payroll", emoji: "👥" },
  { key: "software", label: "Software & Operations", emoji: "💻" },
  { key: "dues", label: "Dues, Licenses & Membership", emoji: "📜" },
  { key: "realestate", label: "Real Estate", emoji: "🏠" },
  { key: "controllable", label: "Controllable", emoji: "🎛️" },
] as const;

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number]["key"];

export function expenseCategoryLabel(key: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

// KPI keys that count as "leads" for the all-in cost-per-lead figure.
export const LEAD_KPI_KEYS = ["ppl_leads", "text_responses", "direct_mail_responses", "leads_generated"];
