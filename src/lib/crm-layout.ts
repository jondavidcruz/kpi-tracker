// 🧩 Per-user contact-page widget layout — CLIENT-SAFE module (no DB import, so it can be
// imported by the client CrmLayoutController). The DB read/write lives in crm-layout-store.ts
// (server-only). Jon 2026-10-26.

export type WidgetDef = { id: string; label: string; column: "left" | "right" };

// The customizable panels, in their DEFAULT order within each column — this MUST match the
// page's DOM order so a user who never customizes sees no change.
export const CRM_WIDGETS: WidgetDef[] = [
  // LEFT column (top → bottom)
  { id: "contact", label: "👤 Contact info", column: "left" },
  { id: "dnd", label: "🔕 Do-not-disturb", column: "left" },
  { id: "documents", label: "📎 Documents", column: "left" },
  { id: "opportunity", label: "🎯 Opportunity", column: "left" },
  { id: "gate", label: "🚦 SOP gate", column: "left" },
  { id: "discovery", label: "📋 Discovery forms", column: "left" },
  { id: "parties", label: "🤝 Parties in this deal", column: "left" },
  // RIGHT column (top → bottom)
  { id: "developers", label: "🏗 Vetted developers", column: "right" },
  { id: "agents", label: "🧑‍💼 Matching buyer agents", column: "right" },
  { id: "marketing", label: "📣 Marketing checklist", column: "right" },
  { id: "offers", label: "💰 Offers received", column: "right" },
  { id: "tasks", label: "⏰ Tasks", column: "right" },
  { id: "appointments", label: "📅 Appointments", column: "right" },
];

export type CrmLayout = { order: string[]; hidden: string[] };
