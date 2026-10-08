import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { logCrmEvent } from "@/lib/crm";

export const dynamic = "force-dynamic";

// 📝 PandaDoc → War Room webhook. Paste this URL into PandaDoc → Dev Center →
// Webhooks:  https://kpi-tracker-lovat.vercel.app/api/pandadoc/events
// Subscribe to "Document state changed" (+ "Recipient completed" if offered).
// PandaDoc signs calls as ?signature=HMAC_SHA256(body, shared_key); set that
// shared key in Vercel as PANDADOC_WEBHOOK_KEY to enforce verification.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const key = process.env.PANDADOC_WEBHOOK_KEY;
  if (key) {
    const sig = req.nextUrl.searchParams.get("signature") ?? "";
    const want = crypto.createHmac("sha256", key).update(raw).digest("hex");
    if (!sig || sig !== want) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let events: Array<{ event?: string; data?: Record<string, unknown> }> = [];
  try { const parsed = JSON.parse(raw); events = Array.isArray(parsed) ? parsed : [parsed]; } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  for (const ev of events) {
    const d = (ev.data ?? {}) as { id?: string; name?: string; status?: string; metadata?: Record<string, string> };
    const status = String(d.status ?? "");
    const meta = d.metadata ?? {};
    const oppId = meta.oppId ?? "";
    const contactId = meta.contactId ?? "";
    if (!contactId) continue; // not one of our CRM drafts
    const docName = d.name ?? "contract";
    const kindLabel = meta.kind === "novation" ? "NOVATION" : meta.kind === "cash" ? "CASH" : "";

    if (status === "document.completed") {
      // ✍️ signed by everyone → timeline + move to a signed stage + rep task
      const opp = oppId ? await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { id: true, stage: true, pipeline: true, assignedTo: true } }) : null;
      await logCrmEvent({ contactId, oppId, kind: "system", body: `✍️ ${kindLabel} contract SIGNED — ${docName}`, meta: { msgId: `pd-done-${d.id}` }, actor: "pandadoc" });
      if (opp) {
        // find a "signed" stage in THIS lead's own pipeline (GHL or native)
        const { readPipelines } = await import("@/lib/crm");
        const pls = await readPipelines();
        const pl = pls.find((p) => p.name === (opp.pipeline || "War Room")) ?? pls[0];
        const signed = pl?.stages.find((s) => /sign|executed/i.test(s.key) || /sign|executed/i.test(s.label));
        if (signed && opp.stage !== signed.key) {
          await db.crmOpportunity.update({ where: { id: opp.id }, data: { stage: signed.key } }).catch(() => {});
          await logCrmEvent({ contactId, oppId, kind: "stage", body: `${opp.stage} → ${signed.key} (auto: contract signed)`, actor: "pandadoc" });
        }
        await db.crmTask.create({ data: { oppId: opp.id, contactId, title: `🎉 Contract signed — log the Signed Contract KPI + start dispo (${docName})`, due: new Date().toISOString().slice(0, 10), assignedTo: opp.assignedTo, createdBy: "pandadoc" } }).catch(() => {});
      }
    } else if (status === "document.sent") {
      await logCrmEvent({ contactId, oppId, kind: "email", body: `➡️ Us: ${kindLabel} contract SENT for signature — ${docName}`, meta: { msgId: `pd-sent-${d.id}` }, actor: "pandadoc" });
    } else if (status === "document.viewed") {
      await logCrmEvent({ contactId, oppId, kind: "system", body: `👀 Seller OPENED the ${kindLabel.toLowerCase() || ""} contract — ${docName}`, meta: { msgId: `pd-view-${d.id}` }, actor: "pandadoc" });
    } else if (status === "document.declined") {
      await logCrmEvent({ contactId, oppId, kind: "system", body: `❌ Contract DECLINED — ${docName}. Call them.`, meta: { msgId: `pd-decl-${d.id}` }, actor: "pandadoc" });
      const opp2 = oppId ? await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { assignedTo: true } }) : null;
      await db.crmTask.create({ data: { oppId, contactId, title: `❌ Seller DECLINED the contract — call now (${docName})`, due: new Date().toISOString().slice(0, 10), assignedTo: opp2?.assignedTo ?? "", createdBy: "pandadoc" } }).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true });
}
