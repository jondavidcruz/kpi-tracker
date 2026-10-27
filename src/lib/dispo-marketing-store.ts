// 🛠 Server-only store for the EDITABLE marketing checklist (Jon 2026-10-26: "let me update the
// steps myself — some are outdated"). Steps live in Resource (category __marketing_steps__) as
// JSON, falling back to the hard-coded defaults until the owner edits them. No migration. Keeps
// Prisma OUT of the client-safe dispo-marketing.ts (which the checklist component imports).
import "server-only";
import { db } from "./db";
import { MARKETING_STEPS, type MarketingStep, type MarketingOwner } from "./dispo-marketing";

const CAT = "__marketing_steps__";
const GROUPS = new Set(["active", "passive"]);
const OWNERS = new Set(["sharyn", "marie"]);

function clean(raw: unknown): MarketingStep[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MarketingStep[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const key = String(o.key ?? "").trim().slice(0, 60);
    const label = String(o.label ?? "").trim().slice(0, 160);
    const group = String(o.group ?? "");
    const owner = String(o.owner ?? "");
    if (!key || !label || seen.has(key) || !GROUPS.has(group) || !OWNERS.has(owner)) continue;
    seen.add(key);
    out.push({ key, label, group: group as "active" | "passive", owner: owner as MarketingOwner, ...(o.hint ? { hint: String(o.hint).trim().slice(0, 240) } : {}) });
  }
  return out.length ? out : null;
}

export async function readMarketingSteps(): Promise<MarketingStep[]> {
  try {
    const row = await db.resource.findFirst({ where: { category: CAT } });
    const parsed = row?.description ? clean(JSON.parse(row.description)) : null;
    return parsed ?? MARKETING_STEPS;
  } catch { return MARKETING_STEPS; }
}

export async function writeMarketingSteps(steps: MarketingStep[]): Promise<void> {
  const valid = clean(steps);
  if (!valid) return; // never save an empty/garbage set — keep the last good one
  const body = JSON.stringify(valid.slice(0, 40));
  const row = await db.resource.findFirst({ where: { category: CAT } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: body } });
  else await db.resource.create({ data: { category: CAT, title: "marketing-steps", url: "", description: body } });
}
