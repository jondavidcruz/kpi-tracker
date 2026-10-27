// 🧩 Server-only store for the per-user contact-page widget layout (imports Prisma — must NOT
// be imported from any client component; the client-safe types/registry live in crm-layout.ts).
import { db } from "./db";
import type { CrmLayout } from "./crm-layout";

const CAT = "__crm_layout__";
const keyFor = (userId: string) => `crm-layout:${userId}`;

const COLS = new Set(["left", "center", "right"]);
function cleanCols(raw: unknown): Record<string, "left" | "center" | "right"> {
  const out: Record<string, "left" | "center" | "right"> = {};
  if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && COLS.has(v)) out[String(k).slice(0, 60)] = v as "left" | "center" | "right";
  }
  return out;
}

export async function readCrmLayout(userId: string): Promise<CrmLayout> {
  if (!userId) return { order: [], hidden: [] };
  try {
    const row = await db.resource.findFirst({ where: { category: CAT, title: keyFor(userId) } });
    const parsed = row?.description ? (JSON.parse(row.description) as Partial<CrmLayout>) : null;
    return { order: Array.isArray(parsed?.order) ? parsed!.order : [], hidden: Array.isArray(parsed?.hidden) ? parsed!.hidden : [], cols: cleanCols(parsed?.cols) };
  } catch { return { order: [], hidden: [] }; }
}

export async function writeCrmLayout(userId: string, layout: CrmLayout): Promise<void> {
  if (!userId) return;
  const body = JSON.stringify({ order: layout.order.slice(0, 100), hidden: layout.hidden.slice(0, 100), cols: cleanCols(layout.cols) });
  const row = await db.resource.findFirst({ where: { category: CAT, title: keyFor(userId) } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: body } });
  else await db.resource.create({ data: { category: CAT, title: keyFor(userId), url: "", description: body } });
}
