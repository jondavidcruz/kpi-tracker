import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { PNL_STACK_CAT, cleanStackItems, type StackStore } from "@/lib/pnl-stack";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 🧾 Current Stack (go-forward, editable). Owner/manager-only — real figures live in the private DB
// (Resource __pnl_stack__), never the public repo. Any price is editable here; the Excel history is
// untouched.

export async function GET() {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  const row = await db.resource.findFirst({ where: { category: PNL_STACK_CAT } }).catch(() => null);
  let store: StackStore = { items: [] };
  try { if (row?.description) store = JSON.parse(row.description); } catch { store = { items: [] }; }
  return NextResponse.json({ ok: true, store });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { items?: unknown; seededFrom?: string };
  const items = cleanStackItems(body.items);
  const store: StackStore = { items, updatedAt: new Date().toISOString(), seededFrom: typeof body.seededFrom === "string" ? body.seededFrom.slice(0, 20) : undefined };
  const description = JSON.stringify(store);
  const row = await db.resource.findFirst({ where: { category: PNL_STACK_CAT } }).catch(() => null);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "pnl-stack", category: PNL_STACK_CAT, url: "", description } });
  return NextResponse.json({ ok: true, count: items.length });
}
