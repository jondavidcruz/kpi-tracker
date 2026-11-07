import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isOwner, isManager } from "@/lib/auth";
import { readPipelines } from "@/lib/crm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 📥 Owner/manager CSV lead importer (Jon 2026-11-06). The /admin/import-leads page parses a CSV,
// computes the rep split, and POSTs the leads here in chunks. Each upload gets a SEQUENCE NUMBER +
// batch tag so the team can track which list a lead came from. NO welcome SMS/email is sent (this is
// a bulk list, not a single inbound) — but a "call now" task is created so new leads get worked.
// GET            → { nextSeq, history } for the page to label the upload
// POST           → import one chunk { leads:[...], source, listTag, priorityTag?, pipeline?, stage? }
// POST ?finalize → append { seq, label, count } to the import log

const LOG_CAT = "__lead_imports__";

type ImpLog = { seq: number; label: string; count: number; at: string; by: string };

async function readLog(): Promise<ImpLog[]> {
  const row = await db.resource.findFirst({ where: { category: LOG_CAT } }).catch(() => null);
  try { const l = JSON.parse(row?.description || "[]"); return Array.isArray(l) ? (l as ImpLog[]) : []; } catch { return []; }
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  const log = await readLog();
  const nextSeq = (log.reduce((m, x) => Math.max(m, x.seq || 0), 0) || 0) + 1;
  return NextResponse.json({ ok: true, nextSeq, history: log.slice(0, 20) });
}

type LeadIn = {
  name?: string; phone?: string; phone2?: string; phone3?: string; email?: string; email2?: string;
  mailing?: string; propAddr?: string; market?: string; county?: string; state?: string; apn?: string; notes?: string;
  rank?: number; owner?: string;
};

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  const url = new URL(req.url);

  // --- finalize: record the upload in the sequence log ---
  if (url.searchParams.get("finalize") === "1") {
    const b = (await req.json().catch(() => ({}))) as { seq?: number; label?: string; count?: number };
    if (!b.seq || !b.label) return NextResponse.json({ ok: false, error: "seq + label required" }, { status: 400 });
    const log = await readLog();
    log.unshift({ seq: Math.round(b.seq), label: String(b.label).slice(0, 80), count: Math.max(0, Math.round(b.count ?? 0)), at: new Date().toISOString(), by: me.name });
    const row = await db.resource.findFirst({ where: { category: LOG_CAT } }).catch(() => null);
    const description = JSON.stringify(log.slice(0, 100));
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "lead-imports", category: LOG_CAT, url: "", description } });
    return NextResponse.json({ ok: true, recorded: true });
  }

  // --- import a chunk ---
  const body = (await req.json().catch(() => ({}))) as {
    leads?: LeadIn[]; source?: string; listTag?: string; priorityTag?: string; extraTags?: string; pipeline?: string; stage?: string;
  };
  const leads = Array.isArray(body.leads) ? body.leads.slice(0, 150) : [];
  if (!leads.length) return NextResponse.json({ ok: false, error: "no leads in chunk" }, { status: 400 });
  const source = (body.source || "PPL").trim().slice(0, 40);
  const listTag = (body.listTag || "").trim().slice(0, 60);
  const priorityTag = (body.priorityTag || "").trim().slice(0, 40);
  // Base tags on every lead in the chunk; each lead ALSO gets a 📍 STATE tag added per-lead below
  // (Jon 2026-11-07 — a list can span states, so state is tagged per lead, not per upload).
  const extraTags = (body.extraTags || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6);
  const baseTags = [listTag, priorityTag, ...extraTags].filter(Boolean);

  const { toE164US } = await import("@/lib/crm-shared");
  const { normalizeAddress } = await import("@/lib/address");
  const { logCrmEvent } = await import("@/lib/crm");
  const pls = await readPipelines();
  const todayPT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());

  // Resolve the owner's pipeline the same way createCrmLead does (owner-named pipe → Michelle → War
  // Room → first), and the stage the page asked for (default = first/"new").
  const michellePipe = pls.find((p) => /michelle/i.test(p.name));
  function pipeFor(owner: string): { name: string; stageKey: string } {
    const forced = body.pipeline ? pls.find((p) => p.name === body.pipeline) : undefined;
    const first = owner.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const repPipe = first ? pls.find((p) => p.name.toLowerCase().includes(first)) : undefined;
    const p = forced ?? repPipe ?? michellePipe ?? pls.find((p) => p.name === "War Room") ?? pls[0];
    const wantStage = (body.stage || "").trim();
    const stageKey = p?.stages.some((s) => s.key === wantStage) ? wantStage : (p?.stages[0]?.key ?? "new");
    return { name: p?.name ?? "", stageKey };
  }

  let created = 0, dupes = 0, skipped = 0;
  for (const L of leads) {
    const name = (L.name || "").trim();
    const rawPhone = (L.phone || "").trim();
    const phone = toE164US(rawPhone) || rawPhone.replace(/[^+\d]/g, "");
    const p10 = phone.replace(/\D/g, "").slice(-10);
    const email = (L.email || "").trim();
    if (!name && p10.length !== 10) { skipped++; continue; }
    const owner = (L.owner || "").trim() || (michellePipe ? "Michelle Lagudas" : me.name);
    const propTitle = normalizeAddress((L.propAddr || "").trim()) || (L.propAddr || "").trim() || "New lead";

    // dedup by phone (last 10, main/alt) or email
    const existing = (p10.length === 10 || email)
      ? await db.crmContact.findFirst({ where: { archivedAt: null, OR: [
          ...(p10.length === 10 ? [{ phone: { endsWith: p10 } }, { altPhone: { endsWith: p10 } }] : []),
          ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
        ] }, orderBy: { updatedAt: "desc" } }).catch(() => null)
      : null;

    const altPhone = (L.phone2 || "").trim() ? (toE164US(L.phone2!) || (L.phone2 || "").replace(/[^+\d]/g, "")) : "";
    const mailing = (L.mailing || "").trim() ? (normalizeAddress(L.mailing!.trim()) || L.mailing!.trim()) : "";
    // The PROPERTY address is what reps act on and what the opp card / lead page show on the 📍
    // property line (Jon 2026-11-07). Put it on contact.address; mailing (owner's) is kept in
    // __import for mail campaigns. Fall back to mailing only if there's no property address.
    const propAddrClean = (L.propAddr || "").trim() ? (normalizeAddress((L.propAddr || "").trim()) || (L.propAddr || "").trim()) : "";
    const contactAddr = propAddrClean || mailing;

    const contact = existing
      ? await db.crmContact.update({ where: { id: existing.id }, data: {
          ...(existing.email || !email ? {} : { email }),
          ...(existing.altPhone || !altPhone ? {} : { altPhone }),
          ...(existing.address || !contactAddr ? {} : { address: contactAddr }),
          ...(existing.source ? {} : { source }),
          ...(existing.assignedTo ? {} : { assignedTo: owner }),
        } }).catch(() => null)
      : await db.crmContact.create({ data: {
          name: name || propTitle,
          phone: phone ? (phone.startsWith("+") ? phone : p10.length === 10 ? `+1${p10}` : phone) : "",
          altPhone, email, source, assignedTo: owner, address: contactAddr,
        } }).catch(() => null);
    if (!contact) { skipped++; continue; }

    // skip if this contact already has an OPEN card for the same property (idempotent re-runs)
    const dupeOpp = await db.crmOpportunity.findFirst({ where: {
      contactId: contact.id, archivedAt: null, title: { equals: propTitle, mode: "insensitive" },
    } }).catch(() => null);
    if (dupeOpp) { dupes++; continue; }

    // Per-lead tags: base + the lead's own state (📍 TX / 📍 FL …) so reps can filter by state.
    const stateTag = (L.state || "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    const tags = [...baseTags, stateTag ? `📍 ${stateTag}` : ""].filter(Boolean).join(", ");
    const { name: pipeline, stageKey } = pipeFor(owner);
    const opp = await db.crmOpportunity.create({ data: {
      contactId: contact.id, title: propTitle, pipeline, stage: stageKey, assignedTo: owner,
      ...(tags ? { tags } : {}),
      formData: {
        __leadKind: "home", __leadSource: source,
        __import: { source, market: (L.market || "").trim(), county: (L.county || "").trim(), state: stateTag, mailing, rank: L.rank ?? null, list: listTag },
        ...(L.apn ? { property: { apn: String(L.apn).trim() } } : {}),
      } as never,
    } }).catch(() => null);
    if (!opp) { skipped++; continue; }
    created++;

    // a "call now" task so these new leads get worked (NO welcome SMS/email on a bulk list).
    await db.crmTask.create({ data: { oppId: opp.id, contactId: contact.id, title: `📞 Call now — new lead ${(name || propTitle).split(" ")[0]}`, due: todayPT, assignedTo: owner, createdBy: "list-import" } }).catch(() => {});
    const noteBits = [L.notes?.trim(), L.market ? `Market: ${L.market}` : "", L.rank != null ? `Rank ${L.rank}` : ""].filter(Boolean).join(" · ");
    await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: `📥 Imported from list "${listTag || source}"${noteBits ? ` · ${noteBits}` : ""}`, actor: "list-import" }).catch(() => {});
  }

  return NextResponse.json({ ok: true, created, dupes, skipped });
}
