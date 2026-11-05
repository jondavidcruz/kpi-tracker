// 🔥 Direct REI → War Room hot-lead creation (Jon 2026-11-05: "when a seller replies with a
// price on Direct REI, auto-create a HOT lead for Michelle with the notes, so she doesn't have
// to go into Direct REI and move them manually"). Shared by the real-time webhook AND the
// daily poll so both behave identically: find/create the seller, assign Michelle, tag 🔥 hot,
// drop them at the top of her pipeline, copy the price/notes in, and file a "call NOW" task.
import { db } from "@/lib/db";
import { logCrmEvent, readPipelines } from "@/lib/crm";
import { normalizeAddress } from "@/lib/address";

export const MICHELLE = "Michelle Lagudas";

// 🔀 Enable gate — env flag OR an in-app toggle (Resource) so Jon can turn real-time DirectREI
// leads on/off from the app without touching Vercel (Jon 2026-11-05 wants instant webhook leads).
const LEADS_FLAG = "__drei_leads__";
export async function dreiLeadsOn(): Promise<boolean> {
  if (process.env.DIRECTREI_LEADS === "on") return true;
  const row = await db.resource.findFirst({ where: { category: LEADS_FLAG } }).catch(() => null);
  return row?.description === "on";
}
export async function setDreiLeads(on: boolean): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: LEADS_FLAG } }).catch(() => null);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: on ? "on" : "off" } });
  else await db.resource.create({ data: { title: "drei-leads", category: LEADS_FLAG, url: "", description: on ? "on" : "off" } });
}

// 📨 Breadcrumb of the last 40 authenticated DirectREI webhook deliveries so we can SEE what
// Direct REI actually sends (event names + status) and confirm it's firing in real time.
export async function logDreiWebhook(entry: Record<string, unknown>): Promise<void> {
  const CAT = "__drei_webhook_log__";
  try {
    const row = await db.resource.findFirst({ where: { category: CAT } });
    let list: unknown[] = [];
    try { list = row?.description ? JSON.parse(row.description) : []; } catch { list = []; }
    list.unshift({ at: new Date().toISOString(), ...entry });
    const description = JSON.stringify(list.slice(0, 40));
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "drei-webhook-log", category: CAT, url: "", description } });
  } catch { /* logging never blocks the webhook */ }
}

export type DreiLead = {
  name?: string; email?: string; phone?: string; market?: string;
  address?: string; status?: string; notes?: string; price?: string; dreiId?: string;
};

/** Pull ALL currently-qualified / replied-with-price Direct REI contacts into the War Room as
 *  HOT leads for Michelle (the backfill the webhook can't do — it only fires on NEW status
 *  changes). Shared by the ?dreipull cron and the owner "Pull now" button. Defensive field
 *  parsing because the /contacts response shape varies. */
export async function pullDreiQualifiedLeads(): Promise<{ scanned: number; qualified: number; created: number; error?: string }> {
  const { directReiContacts, directReiSellers } = await import("@/lib/directrei");
  const firstArray = (o: unknown, depth = 0): Array<Record<string, unknown>> | null => {
    if (Array.isArray(o)) return o as Array<Record<string, unknown>>;
    if (o && typeof o === "object" && depth < 2) {
      for (const k of ["data", "contacts", "results", "items", "sellers", "rows", "records"]) {
        const found = firstArray((o as Record<string, unknown>)[k], depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  // Prefer the SELLERS endpoint (sellers only — no buyers/developers); fall back to /contacts.
  let res = await directReiSellers({ limit: "500" });
  let rows = res.ok ? (firstArray(res.body) ?? []) : [];
  if (rows.length === 0) { res = await directReiContacts({ limit: "500" }); rows = res.ok ? (firstArray(res.body) ?? []) : []; }
  if (rows.length === 0) {
    let snip = ""; try { snip = JSON.stringify(res.body).slice(0, 220); } catch { snip = String(res.body).slice(0, 220); }
    return { scanned: 0, qualified: 0, created: 0, error: `no sellers found (HTTP ${res.status}). Raw: ${snip}` };
  }
  const g = (c: Record<string, unknown>, ...keys: string[]) => { for (const k of keys) { const v = c[k]; if (v != null && String(v).trim()) return String(v); } return ""; };
  let created = 0, qualified = 0;
  for (const c of rows) {
    // 🚫 sellers only — never pull buyers/developers/agents into Michelle's seller pipeline.
    const role = g(c, "role", "contact_type", "type", "lead_type", "contact_role", "category").toLowerCase();
    if (/buyer|developer|builder|agent|investor|vendor|wholesaler|cash ?buyer/.test(role)) continue;
    const status = g(c, "status", "stage", "action", "lead_status", "disposition").toLowerCase();
    const notes = g(c, "ai_summary", "ai_reply", "summary", "action_note", "notes", "last_message", "last_reply", "reply", "last_inbound", "conversation", "message", "text", "ai_notes");
    const isHot = /qualif|ready|action.?req|price|offer|interested|replied/i.test(status) || /\$[\d,]+|asking|per ?sqft|would take|willing to/i.test(notes);
    if (!isHot) continue;
    qualified++;
    const price = (notes.match(/\$[\d,]+(?:\.\d+)?/) ?? [])[0] ?? g(c, "price", "asking_price", "offer_price", "list_price");
    const r = await upsertDreiHotLead({
      name: g(c, "name", "full_name", "contact_name", "seller_name", "owner_name"),
      phone: g(c, "phone", "phone_number", "mobile", "phone1", "primary_phone"),
      email: g(c, "email", "email_address"),
      market: g(c, "market", "city"),
      address: g(c, "property_address", "mailing_street", "address", "street", "property_street", "situs_address", "situs", "prop_address", "full_address", "property"),
      status, notes, price, dreiId: g(c, "id", "contact_id", "uuid"),
    }).catch(() => null);
    if (r?.created) created++;
  }
  return { scanned: rows.length, qualified, created };
}

/** Upsert a Direct-REI-qualified seller as a HOT lead in Michelle's pipeline. Idempotent:
 *  won't re-tag / re-task a contact already flagged for this same qualification in the last
 *  3 days. Returns { created, oppId } or null if there's nothing to key on. */
export async function upsertDreiHotLead(d: DreiLead): Promise<{ created: boolean; oppId: string } | null> {
  const phone = (d.phone ?? "").replace(/[^+\d]/g, "");
  const last10 = phone.replace(/\D/g, "").slice(-10);
  const email = (d.email ?? "").trim().toLowerCase();
  if (last10.length !== 10 && !email) return null;

  let contact = await db.crmContact.findFirst({
    where: { OR: [...(last10.length === 10 ? [{ phone: { contains: last10 } }] : []), ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : [])] },
  }).catch(() => null);

  // Keep the property ADDRESS separate from the market (CA/TX) — storing the market as the
  // address is why some cards showed only "CA" (Jon 2026-11-05).
  const addr = (d.address ?? "").trim() ? (normalizeAddress(d.address!.trim()) || d.address!.trim()) : "";
  const title = addr || `${d.name ?? "Direct REI seller"}${d.market ? ` — ${d.market}` : ""}`;

  if (!contact) {
    contact = await db.crmContact.create({ data: {
      name: (d.name ?? "").trim() || phone || email || "Direct REI seller",
      phone: phone ? (phone.startsWith("+") ? phone : `+1${last10}`) : "",
      email, address: addr,
      source: `Direct REI${d.market ? ` (${d.market})` : ""}`,
      assignedTo: MICHELLE,
      tags: "hot",
    } });
  } else {
    const patch: Record<string, unknown> = {};
    if (!/\bhot\b/i.test(contact.tags)) patch.tags = contact.tags ? `${contact.tags},hot` : "hot";
    if (!(contact.address ?? "").trim() && addr) patch.address = addr; // backfill a missing address on re-pull
    if (Object.keys(patch).length) await db.crmContact.update({ where: { id: contact.id }, data: patch }).catch(() => {});
  }

  // 🔁 Idempotency — did we already file a RICH note (with price/text)? If the earlier note was
  // thin, let a re-pull enrich it with the price + the seller's message.
  const recent = await db.crmEvent.findFirst({
    where: { contactId: contact.id, kind: "system", body: { startsWith: "🔥 Direct REI QUALIFIED" }, at: { gte: new Date(Date.now() - 3 * 86_400_000) } },
    select: { id: true, body: true },
  }).catch(() => null);
  const recentHasDetail = recent ? /[$“]/.test(recent.body) : false;

  let opp = await db.crmOpportunity.findFirst({ where: { contactId: contact.id, archivedAt: null } });
  if (!opp) {
    const pipe = (await readPipelines()).find((p) => p.name.toLowerCase().includes("michelle"));
    // Land in the NEW stage (Jon 2026-11-05: "put it under New, not Follow Up"), falling back
    // to the pipeline's first stage if there's no stage literally called "New".
    const newStage = pipe?.stages.find((s) => /\bnew\b/i.test(`${s.key} ${s.label}`))?.key ?? pipe?.stages[0]?.key ?? "new";
    opp = await db.crmOpportunity.create({ data: {
      contactId: contact.id, title, stage: newStage, pipeline: pipe?.name ?? "", assignedTo: MICHELLE, tags: "hot",
    } });
  }
  // Skip re-noting only if we already filed a rich note, or there's nothing new to add.
  if (recent && (recentHasDetail || (!d.price && !d.notes))) return { created: false, oppId: opp.id };

  const priceLine = d.price ? ` · 💰 ${d.price}` : "";
  const noteLine = d.notes ? `\n“${d.notes.slice(0, 300)}”` : "";
  await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: `🔥 Direct REI QUALIFIED — replied, auto-routed to ${MICHELLE}${priceLine}${noteLine}`, actor: "directrei" }).catch(() => {});
  const openTask = await db.crmTask.findFirst({ where: { contactId: contact.id, createdBy: "directrei", doneAt: null }, select: { id: true } }).catch(() => null);
  if (!openTask) await db.crmTask.create({ data: { contactId: contact.id, oppId: opp.id, title: `🔥 HOT — Direct REI reply${d.price ? ` (${d.price})` : ""} — call ${contact.name} NOW`, due: new Date().toISOString().slice(0, 10), assignedTo: MICHELLE, createdBy: "directrei" } }).catch(() => {});
  await db.crmOpportunity.update({ where: { id: opp.id }, data: { updatedAt: new Date() } }).catch(() => {});
  return { created: true, oppId: opp.id };
}
