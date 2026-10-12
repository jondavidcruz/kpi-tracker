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

type VmCfg = { text?: string; audioUrl?: string };
async function readTexts(): Promise<{ rowId: string | null; map: Record<string, VmCfg> }> {
  const row = await db.resource.findFirst({ where: { category: CAT } });
  let raw: Record<string, VmCfg | string> = {};
  try { raw = row?.description ? JSON.parse(row.description) : {}; } catch { /* fresh */ }
  // back-compat: early rows stored a bare string (the script text)
  const map: Record<string, VmCfg> = {};
  for (const [k, v] of Object.entries(raw)) map[k] = typeof v === "string" ? { text: v } : v;
  return { rowId: row?.id ?? null, map };
}
async function writeTexts(rowId: string | null, map: Record<string, VmCfg>) {
  const description = JSON.stringify(map);
  if (rowId) await db.resource.update({ where: { id: rowId }, data: { description } });
  else await db.resource.create({ data: { title: "vm-drops", category: CAT, url: "", description } });
}

function gate(me: Awaited<ReturnType<typeof getCurrentUser>>) {
  return !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
}

export async function GET() {
  const me = await getCurrentUser();
  if (!gate(me)) return NextResponse.json({ error: "no access" }, { status: 403 });
  const { map } = await readTexts();
  const first = firstOf(me!.name);
  return NextResponse.json({ text: map[first]?.text || DEFAULT_TEXT.replace("{rep}", `${first[0].toUpperCase()}${first.slice(1)}`), audioUrl: map[first]?.audioUrl ?? "" });
}

export async function PUT(req: NextRequest) {
  const me = await getCurrentUser();
  if (!gate(me)) return NextResponse.json({ error: "no access" }, { status: 403 });
  const first = firstOf(me!.name);
  const ct = req.headers.get("content-type") ?? "";
  // 🎙 recorded voicemail (multipart WAV from /account) — stored in Drive,
  // played verbatim into answering machines; beats the TTS script when set.
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData();
    const f = fd.get("audio");
    if (!(f instanceof File) || f.size === 0 || f.size > 4 * 1024 * 1024) return NextResponse.json({ error: "bad audio (max 4MB)" }, { status: 400 });
    const { gdriveConfigured, uploadToDrive } = await import("@/lib/gdrive");
    if (!gdriveConfigured()) return NextResponse.json({ error: "Drive not configured" }, { status: 503 });
    const url = await uploadToDrive(`vm-${first}-${Date.now()}.wav`, new Uint8Array(await f.arrayBuffer()), "audio/wav");
    const { rowId, map } = await readTexts();
    map[first] = { ...map[first], audioUrl: url };
    await writeTexts(rowId, map);
    return NextResponse.json({ ok: true, audioUrl: url });
  }
  const body = (await req.json().catch(() => ({}))) as { text?: string; clearAudio?: boolean };
  const { rowId, map } = await readTexts();
  if (body.clearAudio) {
    map[first] = { ...map[first], audioUrl: "" };
    await writeTexts(rowId, map);
    return NextResponse.json({ ok: true });
  }
  const text = String(body.text ?? "").trim().slice(0, 600);
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });
  map[first] = { ...map[first], text };
  await writeTexts(rowId, map);
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
  const cfg = map[first] ?? {};
  const clientState = Buffer.from(JSON.stringify({ vm: leg.id })).toString("base64");
  // recorded voice wins; TTS script is the fallback
  const res = cfg.audioUrl
    ? await fetch(`https://api.telnyx.com/v2/calls/${leg.id}/actions/playback_start`, {
        method: "POST", headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ audio_url: cfg.audioUrl, client_state: clientState }),
      })
    : await fetch(`https://api.telnyx.com/v2/calls/${leg.id}/actions/speak`, {
        method: "POST", headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ payload: (cfg.text || DEFAULT_TEXT).replace("{rep}", `${first[0].toUpperCase()}${first.slice(1)}`), voice: "female", language: "en-US", client_state: clientState }),
      });
  if (!res.ok) return NextResponse.json({ error: (await res.text()).slice(0, 160) }, { status: 502 });
  return NextResponse.json({ ok: true });
}
