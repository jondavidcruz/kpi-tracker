import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { PNL_OVERRIDES_CAT, type PnlOverrides } from "@/lib/pnl-sheet";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ✏️ Owner/manager P&L label overrides (Jon 2026-11-07: "let me rename softwares we no longer use /
// edit things but keep the numbers the same"). Display-only renames + hides, keyed by `${cat}|label`.
// Stored in the private DB (Resource __pnl_overrides__) — never touches a number.

export async function GET() {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  const row = await db.resource.findFirst({ where: { category: PNL_OVERRIDES_CAT } }).catch(() => null);
  let overrides: PnlOverrides = {};
  try { if (row?.description) overrides = JSON.parse(row.description); } catch { overrides = {}; }
  return NextResponse.json({ ok: true, overrides });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { overrides?: Record<string, { label?: string; cut?: boolean; hidden?: boolean }> };
  const clean: PnlOverrides = {};
  for (const [k, v] of Object.entries(body.overrides || {})) {
    if (typeof k !== "string" || !k.includes("|")) continue;
    const o: { label?: string; cut?: boolean; hidden?: boolean } = {};
    if (typeof v?.label === "string" && v.label.trim()) o.label = v.label.trim().slice(0, 80);
    if (v?.cut === true) o.cut = true;
    if (v?.hidden === true) o.hidden = true;
    if (o.label || o.cut || o.hidden) clean[k.slice(0, 160)] = o;
  }
  const description = JSON.stringify(clean);
  const row = await db.resource.findFirst({ where: { category: PNL_OVERRIDES_CAT } }).catch(() => null);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "pnl-overrides", category: PNL_OVERRIDES_CAT, url: "", description } });
  return NextResponse.json({ ok: true, count: Object.keys(clean).length });
}
