import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { firstOf } from "@/lib/crm-comms";

export const dynamic = "force-dynamic";

// 📼 Voicemail drop (Jon's worklist 2026-10-12): the rep hits an answering
// machine → one click speaks their saved voicemail script into the call via
// Telnyx TTS and hangs up when it finishes (the existing call.speak.ended
// handler does the hangup via client_state {vm}). Scripts are per-rep.
const CAT = "__vm_drops__";
const DEFAULT_TEXT = "Hi, this is {rep} with Freedom Offers. We buy properties for cash with no fees and no repairs needed. I was reaching out about your property — please call or text me back at this number whenever works. Thanks, talk soon!";

async function readTexts(): Promise<{ rowId: string | null; map: Record<string, string> }> {
  const row = await db.resource.findFirst({ where: { category: CAT } });
  let map: Record<string, string> = {};
  try { map = row?.description ? JSON.parse(row.description) : {}; } catch { /* fresh */ }
  return { rowId: row?.id ?? null, map };
}

function gate(me: Awaited<ReturnType<typeof getCurrentUser>>) {
  return !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
}

export async function GET() {
  const me = await getCurrentUser();
  if (!gate(me)) return NextResponse.json({ error: "no access" }, { status: 403 });
  const { map } = await readTexts();
  const first = firstOf(me!.name);
  return NextResponse.json({ text: map[first] || DEFAULT_TEXT.replace("{rep}", `${first[0].toUpperCase()}${first.slice(1)}`) });
}

export async function PUT(req: NextRequest) {
  const me = await getCurrentUser();
  if (!gate(me)) return NextResponse.json({ error: "no access" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = String(body.text ?? "").trim().slice(0, 600);
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });
  const { rowId, map } = await readTexts();
  map[firstOf(me!.name)] = text;
  const description = JSON.stringify(map);
  if (rowId) await db.resource.update({ where: { id: rowId }, data: { description } });
  else await db.resource.create({ data: { title: "vm-drops", category: CAT, url: "", description } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!gate(me)) return NextResponse.json({ error: "no access" }, { status: 403 });
  if (!process.env.TELNYX_API_KEY) return NextResponse.json({ error: "no TELNYX_API_KEY" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const last10 = String(body.to ?? "").replace(/\D/g, "").slice(-10);
  if (last10.length !== 10) return NextResponse.json({ error: "bad number" }, { status: 400 });
  const row = await db.resource.findFirst({ where: { category: "__active_out__" } });
  let m: Record<string, { id: string; at: string }> = {};
  try { m = row?.description ? JSON.parse(row.description) : {}; } catch { /* none */ }
  const leg = m[last10];
  if (!leg || Date.now() - Date.parse(leg.at) > 2 * 3600_000) return NextResponse.json({ error: "no live call found for that number" }, { status: 404 });
  const { map } = await readTexts();
  const first = firstOf(me!.name);
  const text = map[first] || DEFAULT_TEXT.replace("{rep}", `${first[0].toUpperCase()}${first.slice(1)}`);
  const clientState = Buffer.from(JSON.stringify({ vm: leg.id })).toString("base64");
  const res = await fetch(`https://api.telnyx.com/v2/calls/${leg.id}/actions/speak`, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ payload: text.replace("{rep}", `${first[0].toUpperCase()}${first.slice(1)}`), voice: "female", language: "en-US", client_state: clientState }),
  });
  if (!res.ok) return NextResponse.json({ error: (await res.text()).slice(0, 160) }, { status: 502 });
  return NextResponse.json({ ok: true });
}
