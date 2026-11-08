import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { PNL_STACK_CAT, cleanStackItems, stackTotal, appendSnapshot, type StackStore } from "@/lib/pnl-stack";

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
  const row = await db.resource.findFirst({ where: { category: PNL_STACK_CAT } }).catch(() => null);
  // Carry history forward and snapshot this month's true run cost (active, non-paused).
  let priorHistory: StackStore["history"];
  try { if (row?.description) priorHistory = (JSON.parse(row.description) as StackStore).history; } catch { /* */ }
  const month = new Date().toISOString().slice(0, 7);
  const history = appendSnapshot(priorHistory, month, stackTotal(items));
  const store: StackStore = { items, updatedAt: new Date().toISOString(), seededFrom: typeof body.seededFrom === "string" ? body.seededFrom.slice(0, 20) : undefined, history };
  const description = JSON.stringify(store);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "pnl-stack", category: PNL_STACK_CAT, url: "", description } });
  return NextResponse.json({ ok: true, count: items.length });
}
