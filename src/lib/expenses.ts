// Expense categories for the C-suite P&L tracker (mirrors the spreadsheet).
// `hint` explains the bucket in plain English for non-accountants.
export const EXPENSE_CATEGORIES = [
  { key: "payroll", label: "Payroll", emoji: "👥", color: "indigo", hint: "Team pay — contractors, salaries, payout fees" },
  { key: "software", label: "Software & Tools", emoji: "💻", color: "sky", hint: "CRMs, dialer, lead tools, subscriptions" },
  { key: "dues", label: "Dues & Licenses", emoji: "📜", color: "amber", hint: "Memberships, domains, AI tools, fees" },
  { key: "realestate", label: "Real Estate", emoji: "🏠", color: "emerald", hint: "Deal costs — escrow, repairs, closing" },
  { key: "controllable", label: "Controllable", emoji: "🎛️", color: "rose", hint: "Car, travel, meals, supplies, training" },
  { key: "marketing", label: "Marketing & Leads", emoji: "📣", color: "violet", hint: "PPL credits, SMS, direct mail, lead-gen spend — feeds cost-per-lead + ROI" },
] as const;

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number]["key"];

export function expenseCategoryLabel(key: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

// KPI keys that count as "leads" for the all-in cost-per-lead figure.
export const LEAD_KPI_KEYS = ["ppl_leads", "text_responses", "direct_mail_responses", "leads_generated"];
