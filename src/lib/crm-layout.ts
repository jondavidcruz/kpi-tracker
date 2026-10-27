import { db } from "./db";

// 🧩 Per-user layout for the contact page's widgets (Jon 2026-10-26: "give me the ability to
// move these around + hide them myself instead of telling you in Claude Code"). Each panel is
// tagged data-widget="<id>"; a user's saved order + hidden set is applied with CSS order /
// display on the client, so there's NO server-side JSX restructuring (safe on this big page).
// Stored in Resource, category __crm_layout__, one row per user — no schema migration.

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
  { id: "buyers", label: "📇 Buyers & agents on this deal", column: "right" },
  { id: "offers", label: "💰 Offers received", column: "right" },
  { id: "tasks", label: "⏰ Tasks", column: "right" },
  { id: "appointments", label: "📅 Appointments", column: "right" },
];

export type CrmLayout = { order: string[]; hidden: string[] };

const CAT = "__crm_layout__";
const keyFor = (userId: string) => `crm-layout:${userId}`;

export async function readCrmLayout(userId: string): Promise<CrmLayout> {
  if (!userId) return { order: [], hidden: [] };
  try {
    const row = await db.resource.findFirst({ where: { category: CAT, title: keyFor(userId) } });
    const parsed = row?.description ? (JSON.parse(row.description) as Partial<CrmLayout>) : null;
    return { order: Array.isArray(parsed?.order) ? parsed!.order : [], hidden: Array.isArray(parsed?.hidden) ? parsed!.hidden : [] };
  } catch { return { order: [], hidden: [] }; }
}

export async function writeCrmLayout(userId: string, layout: CrmLayout): Promise<void> {
  if (!userId) return;
  const body = JSON.stringify({ order: layout.order.slice(0, 100), hidden: layout.hidden.slice(0, 100) });
  const row = await db.resource.findFirst({ where: { category: CAT, title: keyFor(userId) } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: body } });
  else await db.resource.create({ data: { category: CAT, title: keyFor(userId), url: "", description: body } });
}
