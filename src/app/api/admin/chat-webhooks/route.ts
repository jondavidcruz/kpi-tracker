// 💬 Set/read the Google Chat room webhooks (DB override Resource "__chat_webhooks__"
// that postToSpace prefers over the env var). Owner session OR CRON_SECRET, so it can be
// configured from the app (the /admin/chat-webhooks page) or scripted (Jon 2026-10-27).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isOwner } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SPACES = ["contracts", "kpi", "phonehealth", "receipts", "leadership", "team", "acquisitions", "directrei"];

async function gate(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const bySecret = !!secret && (auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret);
  if (bySecret) return true;
  const me = await getCurrentUser().catch(() => null);
  return isOwner(me);
}

async function load(): Promise<Record<string, string>> {
  const row = await db.resource.findFirst({ where: { category: "__chat_webhooks__" } });
  try { return row?.description ? JSON.parse(row.description) : {}; } catch { return {}; }
}

export async function GET(request: Request) {
  if (!(await gate(request))) return NextResponse.json({ error: "owner only" }, { status: 403 });
  const cur = await load();
  // Never echo the tokens — just which rooms are set.
  const set = Object.fromEntries(Object.keys(cur).map((k) => [k, cur[k] ? `set (space ${cur[k].match(/\/spaces\/([^/]+)\//)?.[1] ?? "?"})` : ""]));
  return NextResponse.json({ ok: true, configured: set });
}

export async function POST(request: Request) {
  if (!(await gate(request))) return NextResponse.json({ error: "owner only" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<string, string> | null;
  if (!body) return NextResponse.json({ ok: false, msg: "bad body" }, { status: 400 });
  const cur = await load();
  const next = { ...cur };
  const changed: string[] = [];
  for (const s of SPACES) {
    const v = String(body[s] ?? "").trim();
    if (!v) continue;
    if (v === "__clear__") { delete next[s]; changed.push(`${s}:cleared`); continue; }
    if (/^https:\/\/chat\.googleapis\.com\/v1\/spaces\//.test(v)) { next[s] = v; changed.push(s); }
  }
  const payload = JSON.stringify(next);
  const row = await db.resource.findFirst({ where: { category: "__chat_webhooks__" } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: payload } });
  else await db.resource.create({ data: { title: "chat-webhooks", category: "__chat_webhooks__", url: "", description: payload } });
  return NextResponse.json({ ok: true, changed, configuredRooms: Object.keys(next) });
}
