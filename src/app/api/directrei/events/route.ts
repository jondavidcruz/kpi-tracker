import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { logCrmEvent } from "@/lib/crm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ⚡ DirectREI → War Room per-contact Deal-Blast events (Jon 2026-10-22). DirectREI
// POSTs one event per buyer touch (sent/delivered/opened/replied/call_completed/…)
// to this URL with ?k=<shared key>. We match on external_id ("<oppId>:<buyerId>"),
// which we set when launching the blast, and drop the event onto that deal's buyer
// tracker + timeline — so replies land where the deal lives, not in DirectREI's
// inbox. Built to docs/directrei-integration-spec.md §4. No-op-safe: an event we
// can't match is acknowledged (200) and ignored, never thrown.
function sharedKey() {
  return crypto.createHash("sha256").update(`${process.env.CRON_SECRET ?? ""}drei-events`).digest("hex").slice(0, 24);
}

type BlastEvent = {
  event?: string; campaign_id?: string; channel?: string; external_id?: string;
  contact?: { phone?: string; email?: string }; detail?: string; at?: string;
};

// event → the tracker stage it implies (reply beats a passive open/send)
const STAGE_FOR: Record<string, "contacted" | "following_up"> = {
  sent: "contacted", delivered: "contacted", opened: "contacted", call_completed: "contacted",
  replied: "following_up",
};

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (req.nextUrl.searchParams.get("k") !== sharedKey()) return NextResponse.json({ error: "bad key" }, { status: 401 });
  let b: BlastEvent = {};
  try { b = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const ev = (b.event ?? "").trim();
  const ext = (b.external_id ?? "").trim();
  const [oppId, buyerId] = ext.split(":");
  if (!oppId || !buyerId) return NextResponse.json({ handled: "no-external-id" });

  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { formData: true, contactId: true } }).catch(() => null);
  if (!opp) return NextResponse.json({ handled: "unknown-opp" });

  const fd = (opp.formData ?? {}) as Record<string, unknown>;
  const list = Array.isArray(fd.__dispoBuyers) ? (fd.__dispoBuyers as Record<string, unknown>[]) : [];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  let name = "a buyer";
  const nextStage = STAGE_FOR[ev];
  const next = list.map((r) => {
    if (r.buyerId !== buyerId) return r;
    name = String(r.name || name);
    // only advance forward (never knock a buyer who already made an offer back)
    const bumped = nextStage && r.stage !== "offer_in" && r.stage !== "passed"
      ? (r.stage === "following_up" && nextStage === "contacted" ? r.stage : nextStage)
      : r.stage;
    return { ...r, stage: bumped, lastContact: today };
  });
  if (nextStage) await db.crmOpportunity.update({ where: { id: oppId }, data: { formData: { ...fd, __dispoBuyers: next } as never } }).catch(() => {});

  const icon = ev === "replied" ? "💬" : ev === "opened" ? "👀" : ev === "call_completed" ? "📞" : ev === "opted_out" ? "🔕" : ev === "bounced" ? "⚠️" : "⚡";
  const chan = b.channel ? ` (${b.channel})` : "";
  const body = `${icon} DirectREI blast: ${name} — ${ev || "event"}${chan}${b.detail ? `: ${String(b.detail).slice(0, 200)}` : ""}`;
  if (opp.contactId) await logCrmEvent({ contactId: opp.contactId, oppId, kind: ev === "replied" ? "note" : "system", body, actor: "directrei-blast" }).catch(() => {});

  return NextResponse.json({ handled: ev || "ok", matched: name });
}
