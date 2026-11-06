import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { dmSearchLeads, buildLandFilters, type DmLoc, type LandFilterInput, type DmLead } from "@/lib/dealmachine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MICHELLE = "Michelle Lagudas"; // acquisitions — land leads route to her

// ⬇️ PULL leads from DealMachine into the CRM. SPENDS CREDITS (search enriches owner contacts).
// Guarded: manager-only, explicit POST, capped. Raw results are saved to __dm_pulls__ BEFORE
// import so paid data is never lost if an import hiccups. Deduped on import.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { locations?: DmLoc[]; land?: LandFilterInput; perPage?: number; areaName?: string };
  if (!body.locations?.length) return NextResponse.json({ error: "pick an area first" }, { status: 400 });
  const perPage = Math.min(100, Math.max(1, Math.round(body.perPage ?? 25)));
  const filters = buildLandFilters(body.land ?? { propertyTypes: [6] });

  const r = await dmSearchLeads(body.locations, filters, perPage);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  const leads = r.leads ?? [];

  // 1) Save the paid pull to a reserved-JSON audit log FIRST (protect the credits spent).
  try {
    const CAT = "__dm_pulls__";
    const row = await db.resource.findFirst({ where: { category: CAT } });
    let log: unknown[] = []; try { log = JSON.parse(row?.description || "[]"); } catch { /* fresh */ }
    log.unshift({ at: new Date().toISOString(), by: me.name, area: body.areaName ?? "", credits: r.creditsUsed, pulled: leads.length, leads });
    const description = JSON.stringify((log as unknown[]).slice(0, 60));
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "dm-pulls", category: CAT, url: "", description } });
  } catch { /* never block the import on the audit write */ }

  // 2) Import into the CRM (dedup by phone last-10, else by owner+property address).
  const { logCrmEvent } = await import("@/lib/crm");
  const today = new Date().toISOString().slice(0, 10);
  let imported = 0, duplicates = 0, skipped = 0;
  for (const L of leads as DmLead[]) {
    const digits = (L.phone || "").replace(/\D/g, "");
    const last10 = digits.slice(-10);
    if (!L.address && !last10) { skipped++; continue; }
    let contact = last10.length === 10
      ? await db.crmContact.findFirst({ where: { phone: { contains: last10 } } }).catch(() => null)
      : null;
    if (!contact && L.ownerName && L.address) contact = await db.crmContact.findFirst({ where: { name: { equals: L.ownerName, mode: "insensitive" }, address: { contains: L.city || "" } } }).catch(() => null);
    if (!contact) {
      contact = await db.crmContact.create({ data: {
        name: L.ownerName || L.address || "Land owner",
        phone: last10.length === 10 ? `+1${last10}` : "",
        email: L.email || "", address: L.mailing || "", source: "DealMachine", tags: "land",
        assignedTo: MICHELLE,
      } }).catch(() => null);
      if (!contact) { skipped++; continue; }
    }
    // dedup the opportunity per contact + property address
    const title = L.address || "Land parcel";
    const existing = await db.crmOpportunity.findFirst({ where: { contactId: contact.id, title: { equals: title, mode: "insensitive" }, archivedAt: null } }).catch(() => null);
    if (existing) { duplicates++; continue; }
    const opp = await db.crmOpportunity.create({ data: {
      contactId: contact.id, title, stage: "new", pipeline: "", assignedTo: MICHELLE, tags: "land,dealmachine",
      formData: { __leadKind: "land", __leadSource: "DealMachine", __kindSource: "dealmachine", ...(L.estValue != null ? { property: { estValue: L.estValue } } : {}) } as never,
    } }).catch(() => null);
    if (!opp) { skipped++; continue; }
    imported++;
    await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: `🏕 Pulled from DealMachine (${body.areaName || "area"})${L.estValue ? ` · est. $${L.estValue.toLocaleString()}` : ""}${L.dnc ? " · ⚠️ owner phone is on DNC" : ""}`, actor: "dealmachine" }).catch(() => {});
  }

  return NextResponse.json({ ok: true, creditsUsed: r.creditsUsed, totalAvailable: r.totalResults, pulled: leads.length, imported, duplicates, skipped, assignedTo: MICHELLE, today });
}
