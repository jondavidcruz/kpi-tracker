// 🏆 PHASE 2 — migrate the Vetted Buyers (MarketContact) into the dispo kanban
// (DS: Developers / DS: Buyer Agents), the single home for buyers now (Jon 2026-10-27:
// "move the vetted buyers into the vetted section on the Kanban. Do not delete any of
// their information. That's our gold. Make that always your priority to protect.").
//
// NON-NEGOTIABLE SAFETY (this is the gold):
//   • NEVER deletes or edits a MarketContact row — the source table stays intact as a
//     permanent backup. We only CREATE kanban cards.
//   • A FULL snapshot of every source record is stashed on the card (formData.__migratedSource)
//     so nothing is ever lost, even a field that doesn't map to a form input.
//   • Idempotent: a per-source marker set in Resource(__buyer_migration__) means a re-run
//     skips anything already migrated — no twins.
//   • Reversible: undo() archives (never deletes) the cards this migration created.
//
// VETTING RULE (Jon 2026-10-27): a developer is only truly VETTED if they have a buy box —
// i.e. the interview has been filled in SOME capacity. No buy box → they land in 🆕 research,
// NOT the ✅ Vetted stage ("if we don't have buy box, then they're not vetted").
import "server-only";
import { db } from "./db";
import { logCrmEvent } from "./crm";
import { DISPO_DEV_PIPELINE, DISPO_AGENT_PIPELINE, isDevNetworkName, isAgentNetworkName, DISPO_NETWORK_PIPELINES } from "./dispo-buyers";

const MIGRATION_CAT = "__buyer_migration__"; // Resource row holding the migrated-id map

type SourceRow = {
  id: string; name: string; type: string; vetStage: string;
  email: string; phone: string; phone2: string; website: string; links: string;
  company: string; title: string; preferredContact: string; decisionMaker: string;
  companySize: string; buyingFrequency: string; priceRange: string; closingSpeed: string;
  dealType: string; buildType: string; minLotSize: string; marketDetails: string;
  market: string; buyBox: string; buyBoxAreas: string; buyBoxStruct: unknown;
  geoPolygon: unknown; geoCentroidLat: number | null; geoCentroidLng: number | null;
  notes: string; outreachLog: string; vettedOn: string; vettedById: string;
};

const SELECT = {
  id: true, name: true, type: true, vetStage: true,
  email: true, phone: true, phone2: true, website: true, links: true,
  company: true, title: true, preferredContact: true, decisionMaker: true,
  companySize: true, buyingFrequency: true, priceRange: true, closingSpeed: true,
  dealType: true, buildType: true, minLotSize: true, marketDetails: true,
  market: true, buyBox: true, buyBoxAreas: true, buyBoxStruct: true,
  geoPolygon: true, geoCentroidLat: true, geoCentroidLng: true,
  notes: true, outreachLog: true, vettedOn: true, vettedById: true,
} as const;

const s = (v: unknown) => (v == null ? "" : String(v)).trim();

/** A developer is VETTED only if they have a buy box in SOME capacity (Jon's rule). */
function hasBuyBox(r: SourceRow): boolean {
  const struct = r.buyBoxStruct;
  const structFilled = !!struct && typeof struct === "object" && Object.keys(struct as object).length > 0;
  return structFilled || [r.buyBox, r.buyBoxAreas, r.priceRange, r.minLotSize, r.dealType, r.buildType, r.market, r.closingSpeed, r.marketDetails].some((x) => s(x) !== "");
}

/** Agents get the agent pipeline; everything else is a developer/cash buyer. */
function isAgentRow(r: SourceRow): boolean {
  return s(r.type).toLowerCase() === "agent";
}

type Plan = {
  srcId: string; name: string; kind: "developer" | "agent"; vetted: boolean;
  pipeline: string; stage: string; phone: string; email: string; reason: string;
};

function planRow(r: SourceRow): Plan {
  const agent = isAgentRow(r);
  const vetted = agent ? true : hasBuyBox(r); // agents: an active partner IS the vetted state
  const pipeline = agent ? DISPO_AGENT_PIPELINE : DISPO_DEV_PIPELINE;
  const stage = agent ? "active" : vetted ? "vetted" : "new";
  return {
    srcId: r.id, name: r.name, kind: agent ? "agent" : "developer", vetted,
    pipeline, stage, phone: s(r.phone) || s(r.phone2), email: s(r.email),
    reason: agent ? "agent → active partner" : vetted ? "has buy box → ✅ Vetted" : "NO buy box → 🆕 research (not vetted)",
  };
}

/** Map a source row onto the dispo Developer Buy-Box / Buyer-Agent form fields.
 *  Loss-tolerant: anything that doesn't fit a field is preserved in __migratedSource. */
function formDataFor(r: SourceRow, p: Plan) {
  const areas = [s(r.buyBoxAreas), s(r.market)].filter(Boolean).join("\n");
  const price = s(r.priceRange) || s(r.buyBox);
  const form = p.kind === "agent"
    ? { agent_profile: {
        relationship: "Active partner",
        brokerage: s(r.company),
        areas,
        buyerTypes: s(r.type),
        representsDevs: "",
        priceRange: price,
        bestContact: ["Call", "Text", "Email"].includes(s(r.preferredContact)) ? s(r.preferredContact) : "",
        sendsDeals: "Maybe",
        notes: [s(r.notes), s(r.outreachLog)].filter(Boolean).join("\n\n").slice(0, 2000),
      } }
    : { dev_buybox: {
        relationship: p.vetted ? "Vetted — good buyer" : "Researching them",
        buyCounties: areas,
        landTypes: [],
        lotSize: s(r.minLotSize),
        priceRange: price,
        closeSpeed: "",
        volume: s(r.buyingFrequency),
        requirements: [s(r.dealType) && `Deal type: ${s(r.dealType)}`, s(r.buildType) && `Build type: ${s(r.buildType)}`, s(r.closingSpeed) && `Close: ${s(r.closingSpeed)}`].filter(Boolean).join(" · "),
        dealBreakers: "",
        decisionMaker: s(r.decisionMaker),
        proofOfFunds: "",
      } };
  return {
    ...form,
    // 🔒 the gold — a full, lossless snapshot of the source MarketContact on the card.
    __migratedSource: {
      marketContactId: r.id, name: r.name, type: r.type, vetStage: r.vetStage,
      email: r.email, phone: r.phone, phone2: r.phone2, website: r.website, links: r.links,
      company: r.company, title: r.title, decisionMaker: r.decisionMaker, companySize: r.companySize,
      buyingFrequency: r.buyingFrequency, priceRange: r.priceRange, closingSpeed: r.closingSpeed,
      dealType: r.dealType, buildType: r.buildType, minLotSize: r.minLotSize, marketDetails: r.marketDetails,
      market: r.market, buyBox: r.buyBox, buyBoxAreas: r.buyBoxAreas, notes: r.notes, outreachLog: r.outreachLog,
      vettedOn: r.vettedOn,
    },
    // structured buy-box + geo kept verbatim for the future cascade ranking rebuild
    __buyBoxStruct: (r.buyBoxStruct ?? null) as never,
    __geoPolygon: (r.geoPolygon ?? null) as never,
    __geoCentroid: (r.geoCentroidLat != null && r.geoCentroidLng != null ? { lat: r.geoCentroidLat, lng: r.geoCentroidLng } : null) as never,
    __import: { type: p.kind === "agent" ? "Buyer Agent" : "Developer", market: s(r.market), source: "Vetted Buyers migration" },
  };
}

async function loadSources(): Promise<SourceRow[]> {
  return db.marketContact.findMany({
    where: { archivedAt: null, vetStage: { in: ["vetted", "active"] }, type: { not: "jv_partner" } },
    orderBy: [{ name: "asc" }],
    select: SELECT,
  }) as unknown as Promise<SourceRow[]>;
}

async function readMarker(): Promise<{ id: string | null; map: Record<string, string>; ranAt?: string }> {
  const row = await db.resource.findFirst({ where: { category: MIGRATION_CAT } }).catch(() => null);
  let map: Record<string, string> = {}; let ranAt: string | undefined;
  try { const j = row?.description ? JSON.parse(row.description) : {}; map = j.map ?? {}; ranAt = j.ranAt; } catch { map = {}; }
  return { id: row?.id ?? null, map, ranAt };
}
async function writeMarker(id: string | null, map: Record<string, string>, actor: string) {
  const payload = JSON.stringify({ map, ranAt: new Date().toISOString(), actor });
  if (id) await db.resource.update({ where: { id }, data: { description: payload } });
  else await db.resource.create({ data: { title: "buyer-migration", category: MIGRATION_CAT, url: "", description: payload } });
}

/** Ensure the DS: Developers / DS: Buyer Agents pipelines exist in the CRM registry. */
async function ensurePipelines() {
  const PIPES_CAT = "__crm_pipelines__";
  const row = await db.resource.findFirst({ where: { category: PIPES_CAT } }).catch(() => null);
  let ghl: Array<{ name: string; stages: Array<{ key: string; label: string }> }> = [];
  try { ghl = row?.description ? JSON.parse(row.description) : []; } catch { ghl = []; }
  let changed = false;
  for (const np of DISPO_NETWORK_PIPELINES) {
    const match = np.name === DISPO_AGENT_PIPELINE ? isAgentNetworkName : isDevNetworkName;
    if (!ghl.some((p) => match(p.name))) { ghl.push({ name: np.name, stages: np.stages }); changed = true; }
  }
  if (changed) {
    if (row) await db.resource.update({ where: { id: row.id }, data: { description: JSON.stringify(ghl) } });
    else await db.resource.create({ data: { title: "crm-pipelines", category: PIPES_CAT, url: "", description: JSON.stringify(ghl) } });
  }
}

/** Resolve an existing kanban contact by phone/email (never create a twin). */
async function findContact(phone: string, email: string) {
  const p10 = phone.replace(/\D/g, "").slice(-10);
  if (p10.length === 10) {
    const byPhone = await db.crmContact.findFirst({ where: { archivedAt: null, OR: [{ phone: { endsWith: p10 } }, { altPhone: { endsWith: p10 } }] }, orderBy: { updatedAt: "desc" } }).catch(() => null);
    if (byPhone) return byPhone;
  }
  if (email) return db.crmContact.findFirst({ where: { archivedAt: null, email: { equals: email, mode: "insensitive" } } }).catch(() => null);
  return null;
}

/** DRY RUN — read-only. Returns exactly what a real run would do, writing nothing. */
export async function planMigration() {
  const [rows, marker] = await Promise.all([loadSources(), readMarker()]);
  const plans = rows.map(planRow);
  const already = plans.filter((p) => marker.map[p.srcId]);
  const todo = plans.filter((p) => !marker.map[p.srcId]);
  const count = (f: (p: Plan) => boolean) => todo.filter(f).length;
  return {
    mode: "dry-run",
    totalVettedBuyers: rows.length,
    alreadyMigrated: already.length,
    toMigrate: todo.length,
    breakdown: {
      developersVetted: count((p) => p.kind === "developer" && p.vetted),
      developersToResearch_noBuyBox: count((p) => p.kind === "developer" && !p.vetted),
      agentsActive: count((p) => p.kind === "agent"),
    },
    sample: todo.slice(0, 12).map((p) => ({ name: p.name, kind: p.kind, stage: p.stage, reason: p.reason, phone: p.phone, email: p.email })),
    note: "Nothing written. MarketContact rows are untouched. Add ?run=1 to execute, ?undo=1 to reverse.",
  };
}

/** EXECUTE — idempotent. Creates kanban cards for not-yet-migrated vetted buyers. */
export async function runMigration(actor: string) {
  await ensurePipelines();
  const [rows, marker] = await Promise.all([loadSources(), readMarker()]);
  const map = { ...marker.map };
  let created = 0, reusedContact = 0, skipped = 0;
  const results: Array<{ name: string; stage: string; oppId: string; reusedContact: boolean }> = [];

  for (const r of rows) {
    if (map[r.id]) { skipped++; continue; } // already migrated
    const p = planRow(r);
    const fd = formDataFor(r, p);

    let contact = await findContact(p.phone, p.email);
    const reused = !!contact;
    if (!contact) {
      contact = await db.crmContact.create({ data: {
        name: r.name, phone: s(r.phone), altPhone: s(r.phone2), email: s(r.email),
        source: "Vetted Buyers migration",
        tags: p.kind === "agent" ? "buyer-agent" : "developer",
        pinnedNote: [s(r.market), s(r.priceRange) || s(r.buyBox)].filter(Boolean).join(" · ").slice(0, 300),
      } });
    } else { reusedContact++; }

    // don't double-create an opp in the same pipeline for a reused contact
    const dupe = reused ? await db.crmOpportunity.findFirst({ where: { contactId: contact.id, pipeline: p.pipeline, archivedAt: null } }).catch(() => null) : null;
    const opp = dupe ?? await db.crmOpportunity.create({ data: {
      contactId: contact.id, title: r.name, pipeline: p.pipeline, stage: p.stage,
      assignedTo: "buyer-migration", formData: fd as never,
    } });
    if (!dupe) {
      await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: `${p.kind === "agent" ? "Buyer agent" : "Developer"} migrated from Vetted Buyers — ${p.reason}`, actor });
      created++;
    }
    map[r.id] = opp.id;
    results.push({ name: r.name, stage: p.stage, oppId: opp.id, reusedContact: reused });
  }

  await writeMarker(marker.id, map, actor);
  return { mode: "run", totalVettedBuyers: rows.length, created, reusedExistingContact: reusedContact, skippedAlreadyMigrated: skipped, results: results.slice(0, 50) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔎 VETTED AUDIT (Jon 2026-10-27): "if they're completely not filled out on the buy
// boxes, then that means they're not really vetted." Scans the "✅ Vetted" developer
// stage + "🤝 Active" agent stage and demotes any card whose interview is EMPTY (zero
// buy-box fields) back to 🆕 research. Partial buy boxes stay — "even if it's not fully
// filled out, we have a majority of the information" counts as vetted. Reversible.
// ─────────────────────────────────────────────────────────────────────────────
const AUDIT_CAT = "__vet_audit__"; // demoted-id map for undo

async function loadVettedNetwork() {
  const { resolveNetworkPipelines } = await import("./dispo-network");
  const net = await resolveNetworkPipelines();
  const sel = { id: true, title: true, contactId: true, formData: true, contact: { select: { name: true } } } as const;
  const [devOpps, agentOpps] = await Promise.all([
    net.dev.length ? db.crmOpportunity.findMany({ where: { archivedAt: null, pipeline: { in: net.dev }, stage: "vetted" }, select: sel }) : [],
    net.agent.length ? db.crmOpportunity.findMany({ where: { archivedAt: null, pipeline: { in: net.agent }, stage: "active" }, select: sel }) : [],
  ]);
  return { devOpps, agentOpps };
}

/** DRY RUN — who in "Vetted"/"Active" has a completely empty buy box. Writes nothing. */
export async function auditVetted() {
  const { devVetScore } = await import("./dev-vetting");
  const { devOpps, agentOpps } = await loadVettedNetwork();
  const dist: Record<number, number> = {};
  for (const o of devOpps) { const f = devVetScore(o.formData, "developer").filled; dist[f] = (dist[f] ?? 0) + 1; }
  const emptyDevs = devOpps.filter((o) => devVetScore(o.formData, "developer").filled === 0);
  const emptyAgents = agentOpps.filter((o) => devVetScore(o.formData, "buyer_agent").filled === 0);
  return {
    mode: "dry-run",
    vettedDevelopers: devOpps.length,
    activeAgents: agentOpps.length,
    notReallyVetted_emptyBuyBox: { developers: emptyDevs.length, agents: emptyAgents.length },
    developerFillDistribution: dist, // {0: n, 1: n, …} — how many vetted devs have N of 8 fields
    sampleEmpty: [...emptyDevs, ...emptyAgents].slice(0, 20).map((o) => o.contact?.name || o.title),
    note: "Empty = ZERO buy-box fields = not truly vetted. ?demote=1 moves ONLY these to 🆕 research; partials stay. ?undoaudit=1 restores them.",
  };
}

/** DEMOTE — move the empty ones to 🆕 research (reversible). Partial buy boxes untouched. */
export async function runVetAudit(actor: string) {
  const { devVetScore } = await import("./dev-vetting");
  const { devOpps, agentOpps } = await loadVettedNetwork();
  const targets = [
    ...devOpps.filter((o) => devVetScore(o.formData, "developer").filled === 0).map((o) => ({ id: o.id, contactId: o.contactId, name: o.contact?.name || o.title, kind: "developer" as const })),
    ...agentOpps.filter((o) => devVetScore(o.formData, "buyer_agent").filled === 0).map((o) => ({ id: o.id, contactId: o.contactId, name: o.contact?.name || o.title, kind: "agent" as const })),
  ];
  const map: Record<string, "developer" | "agent"> = {};
  for (const t of targets) {
    await db.crmOpportunity.update({ where: { id: t.id }, data: { stage: "new" } }).catch(() => {});
    if (t.contactId) await logCrmEvent({ contactId: t.contactId, oppId: t.id, kind: "system", body: "Demoted from Vetted → research: buy box is empty (not truly vetted)", actor }).catch(() => {});
    map[t.id] = t.kind;
  }
  const row = await db.resource.findFirst({ where: { category: AUDIT_CAT } }).catch(() => null);
  const payload = JSON.stringify({ map, ranAt: new Date().toISOString(), actor });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: payload } });
  else await db.resource.create({ data: { title: "vet-audit", category: AUDIT_CAT, url: "", description: payload } });
  return { mode: "demote", demoted: targets.length, names: targets.slice(0, 60).map((t) => t.name) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧹 DE-DUP (Jon 2026-10-27): two migrations (Oct 22 + Oct 27) created twin cards for the
// same buyer (Folstein/Sunlife showed twice). Group all network cards by phone (else name)
// and ARCHIVE the extras, keeping the single most-complete card per buyer (vetted stage +
// fullest buy-box + newest). Never deletes; reversible via the __dedup__ marker.
// ─────────────────────────────────────────────────────────────────────────────
const DEDUP_CAT = "__dedup__";

async function loadDupeGroups() {
  const { resolveNetworkPipelines } = await import("./dispo-network");
  const net = await resolveNetworkPipelines();
  const opps = net.all.length ? await db.crmOpportunity.findMany({
    where: { archivedAt: null, pipeline: { in: net.all } },
    select: { id: true, title: true, pipeline: true, stage: true, formData: true, updatedAt: true, contactId: true, contact: { select: { name: true, phone: true } } },
  }) : [];
  const groups = new Map<string, typeof opps>();
  for (const o of opps) {
    const key = (o.contact?.phone || "").replace(/\D/g, "").slice(-10) || (o.contact?.name || o.title || "").trim().toLowerCase();
    if (!key) continue;
    const arr = groups.get(key) ?? []; arr.push(o); groups.set(key, arr);
  }
  return { opps, dupeGroups: [...groups.values()].filter((g) => g.length > 1) };
}

/** DRY RUN — how many duplicate buyer cards exist. Writes nothing. */
export async function auditDupes() {
  const { opps, dupeGroups } = await loadDupeGroups();
  const extra = dupeGroups.reduce((n, g) => n + (g.length - 1), 0);
  return {
    mode: "dry-run", totalNetworkCards: opps.length, duplicateBuyers: dupeGroups.length, cardsToArchive: extra, uniqueAfter: opps.length - extra,
    sample: dupeGroups.sort((a, b) => b.length - a.length).slice(0, 20).map((g) => ({ buyer: g[0].contact?.name || g[0].title, cards: g.length })),
    note: "Archives the EXTRA cards per buyer (keeps the most complete one). Nothing deleted. ?dedupgo=1 executes, ?undodedup=1 reverses.",
  };
}

/** EXECUTE — archive the extra cards per buyer, keeping the best. Reversible. */
export async function runDedup(actor: string) {
  const { devVetScore } = await import("./dev-vetting");
  const { isAgentNetworkName } = await import("./dispo-buyers");
  const { dupeGroups } = await loadDupeGroups();
  const VETTED = new Set(["vetted", "active"]);
  const archived: string[] = [];
  for (const g of dupeGroups) {
    const scored = g.map((o) => {
      const kind = isAgentNetworkName(o.pipeline) ? "buyer_agent" as const : "developer" as const;
      return { o, vetted: VETTED.has(o.stage) ? 1 : 0, filled: devVetScore(o.formData, kind).filled, at: o.updatedAt.getTime() };
    }).sort((a, b) => b.vetted - a.vetted || b.filled - a.filled || b.at - a.at);
    const keeper = scored[0].o;
    for (const s of scored.slice(1)) {
      const r = await db.crmOpportunity.updateMany({ where: { id: s.o.id, archivedAt: null }, data: { archivedAt: new Date() } }).catch(() => ({ count: 0 }));
      if (r.count && s.o.contactId) { await logCrmEvent({ contactId: s.o.contactId, oppId: s.o.id, kind: "system", body: `Archived duplicate buyer card (kept "${keeper.title}" ${keeper.id})`, actor }).catch(() => {}); archived.push(s.o.id); }
    }
  }
  const row = await db.resource.findFirst({ where: { category: DEDUP_CAT } }).catch(() => null);
  const payload = JSON.stringify({ ids: archived, ranAt: new Date().toISOString(), actor });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: payload } });
  else await db.resource.create({ data: { title: "dedup", category: DEDUP_CAT, url: "", description: payload } });
  return { mode: "dedup", duplicateBuyers: dupeGroups.length, archived: archived.length };
}

/** UNDO — un-archive the cards this de-dup archived. */
export async function undoDedup() {
  const row = await db.resource.findFirst({ where: { category: DEDUP_CAT } }).catch(() => null);
  let ids: string[] = [];
  try { ids = row?.description ? (JSON.parse(row.description).ids ?? []) : []; } catch { ids = []; }
  let restored = 0;
  for (const id of ids) { const r = await db.crmOpportunity.updateMany({ where: { id, archivedAt: { not: null } }, data: { archivedAt: null } }).catch(() => ({ count: 0 })); restored += r.count; }
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: JSON.stringify({ ids: [], ranAt: new Date().toISOString(), undone: true }) } });
  return { mode: "undo-dedup", restored };
}

/** UNDO the demotion — restore demoted cards to Vetted (dev) / Active (agent). */
export async function undoVetAudit() {
  const row = await db.resource.findFirst({ where: { category: AUDIT_CAT } }).catch(() => null);
  let map: Record<string, "developer" | "agent"> = {};
  try { map = row?.description ? (JSON.parse(row.description).map ?? {}) : {}; } catch { map = {}; }
  let restored = 0;
  for (const [id, kind] of Object.entries(map)) {
    const r = await db.crmOpportunity.updateMany({ where: { id, stage: "new" }, data: { stage: kind === "agent" ? "active" : "vetted" } }).catch(() => ({ count: 0 }));
    restored += r.count;
  }
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: JSON.stringify({ map: {}, ranAt: new Date().toISOString(), undone: true }) } });
  return { mode: "undo-audit", restored };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧹 ORPHAN SWEEP (Jon 2026-10-27): after retiring Buyer Research, any UNVETTED buyer that
// lived only in the old MarketContact research pool (vetStage NOT vetted/active) and was
// never migrated into the kanban would be stranded. Sweep them into the kanban's 🆕 research
// stage via upsertNetworkLead (which dedupes by phone/email, so ones already in the kanban
// are skipped). Reversible via the __orphan_sweep__ marker.
// ─────────────────────────────────────────────────────────────────────────────
const SWEEP_CAT = "__orphan_sweep__";
const s2 = (v: unknown) => (v == null ? "" : String(v)).trim();

async function loadOrphanSources() {
  return db.marketContact.findMany({
    where: { archivedAt: null, vetStage: { notIn: ["vetted", "active"] }, type: { not: "jv_partner" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, email: true, phone: true, phone2: true, market: true, buyBox: true, buyBoxAreas: true, notes: true },
  });
}

/** 🧹 Clean up the orphan CONTACTS the first (botched) sweep created for contactless rows —
 *  their opps were archived by the undo, so they have no live card (Jon 2026-10-27). Archive
 *  (reversible) any "Buyer Research sweep" contact with zero non-archived opportunities. */
export async function sweepOrphanContactsDry() {
  const orphans = await db.crmContact.findMany({
    where: { archivedAt: null, source: "Buyer Research sweep", opportunities: { none: { archivedAt: null } } },
    select: { id: true, name: true }, take: 2000,
  });
  return { mode: "dry-run", orphanContacts: orphans.length, note: "Contacts from the botched sweep with no live card. ?orphansgo=1 archives them (reversible).", sample: orphans.slice(0, 12).map((o) => o.name) };
}
export async function runSweepOrphanContacts() {
  const r = await db.crmContact.updateMany({
    where: { archivedAt: null, source: "Buyer Research sweep", opportunities: { none: { archivedAt: null } } },
    data: { archivedAt: new Date() },
  }).catch(() => ({ count: 0 }));
  return { mode: "cleanup", archivedContacts: r.count };
}

/** DRY RUN — how many unvetted research-pool buyers exist (candidates to sweep). */
export async function sweepOrphansDry() {
  const rows = await loadOrphanSources();
  return { mode: "dry-run", unvettedCandidates: rows.length, note: "?sweepgo=1 moves ones NOT already in the kanban into 🆕 research (dedup by phone/email); ?undosweep=1 reverses. Processes up to 400/run.", sample: rows.slice(0, 15).map((r) => r.name) };
}

/** EXECUTE — sweep unvetted orphans into the kanban 🆕 research stage (idempotent, batched). */
export async function runOrphanSweep(actor: string) {
  const { upsertNetworkLead } = await import("./dispo-network-write");
  const rows = await loadOrphanSources();
  const row = await db.resource.findFirst({ where: { category: SWEEP_CAT } }).catch(() => null);
  // doneSet tracks processed SOURCE ids (so each run advances); createdIds tracks created opp
  // ids (for undo). Earlier bug loaded opp ids into the source tracker → every run reprocessed.
  let createdIds: string[] = []; let sweptSrc: string[] = [];
  try { const j = row?.description ? JSON.parse(row.description) : {}; createdIds = j.ids ?? []; sweptSrc = j.sweptSrc ?? []; } catch { /* fresh */ }
  const doneSet = new Set(sweptSrc);
  let created = 0, skipped = 0, noContact = 0, processed = 0;
  for (const r of rows) {
    if (doneSet.has(r.id)) continue;
    if (processed >= 400) break; // cap the UPSERTS per run (contactless rows are skipped cheaply)
    const phone = s2(r.phone) || s2(r.phone2); const email = s2(r.email);
    doneSet.add(r.id); // mark processed no matter what, so it's never reprocessed
    if (!phone && !email) { noContact++; continue; } // can't dedupe a contactless row → skip it
    processed++;
    const res = await upsertNetworkLead({
      name: r.name, phone, email,
      kind: s2(r.type).toLowerCase() === "agent" ? "agent" : "developer",
      market: s2(r.market), buyBox: [s2(r.buyBox), s2(r.buyBoxAreas)].filter(Boolean).join(" · "),
      notes: s2(r.notes), source: "Buyer Research sweep", actor,
    }).catch(() => null);
    if (res?.created) { created++; createdIds.push(res.oppId); } else skipped++;
  }
  const remaining = rows.filter((r) => !doneSet.has(r.id)).length;
  const payload = JSON.stringify({ ids: createdIds, sweptSrc: [...doneSet], ranAt: new Date().toISOString(), actor });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: payload } });
  else await db.resource.create({ data: { title: "orphan-sweep", category: SWEEP_CAT, url: "", description: payload } });
  return { mode: "sweep", processed, created, skippedAlreadyInKanban: skipped, skippedNoContact: noContact, remaining, note: remaining ? "Run ?sweepgo=1 again to continue." : "All swept." };
}

/** UNDO — archive the cards this sweep created. */
export async function undoOrphanSweep() {
  const row = await db.resource.findFirst({ where: { category: SWEEP_CAT } }).catch(() => null);
  let ids: string[] = []; try { ids = row?.description ? (JSON.parse(row.description).ids ?? []) : []; } catch { ids = []; }
  let archived = 0;
  for (const id of ids) { const r = await db.crmOpportunity.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date() } }).catch(() => ({ count: 0 })); archived += r.count; }
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: JSON.stringify({ ids: [], ranAt: new Date().toISOString(), undone: true }) } });
  return { mode: "undo-sweep", archived };
}

/** UNDO — archives (never deletes) every card this migration created, clears the marker. */
export async function undoMigration(actor: string) {
  const marker = await readMarker();
  const oppIds = Object.values(marker.map);
  let archived = 0;
  for (const oppId of oppIds) {
    const r = await db.crmOpportunity.updateMany({ where: { id: oppId, assignedTo: "buyer-migration", archivedAt: null }, data: { archivedAt: new Date() } }).catch(() => ({ count: 0 }));
    archived += r.count;
  }
  if (marker.id) await db.resource.update({ where: { id: marker.id }, data: { description: JSON.stringify({ map: {}, ranAt: new Date().toISOString(), actor, undone: true }) } });
  return { mode: "undo", archivedCards: archived, note: "MarketContact rows were never touched; your Vetted Buyers are fully intact." };
}
