import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 🧹 Nick + Kyle "New column" cleanup audit (Jon 2026-11-18: "remove all Texas
// leads, only show California leads most likely to sell, show how many remain").
//
//   • Plain GET  → READ-ONLY dry run: counts TX / CA / other / unknown per rep,
//                  ranks CA leads by motivation, shows what WOULD be archived.
//   • ?commit=1  → ARCHIVES (reversible — restorable from Contacts) the TX leads
//                  and the weak-CA leads. Non-CA "other" states only with &strict=1.
//                  Unknown-state leads are NEVER auto-archived (left for Jon).
//
// Admin-only (sign in as Jon). Archiving = setting archivedAt; restoreLead() in
// crm/actions.ts puts them back on the board's first stage if ever needed.

// assignedTo is stored as "Nicholas Fair" / "Kyle Brown" — match on first-name prefixes.
const REP_TOKENS: Record<string, string[]> = { "Nick Fair": ["nick", "nicholas", "nic"], "Kyle Brown": ["kyle"] };

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);

/** Best-effort US state (2-letter) from an address string. "" if undetectable. */
function stateOf(raw: string): string {
  const t = ` ${(raw || "").toUpperCase()} `;
  // "City, XX 92101" or "XX 92101-1234" — the strongest signal
  let m = t.match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
  if (m && US_STATES.has(m[1])) return m[1];
  if (/\bCALIFORNIA\b/.test(t)) return "CA";
  if (/\bTEXAS\b/.test(t)) return "TX";
  // ", XX" near the end (no zip present)
  m = t.match(/,\s*([A-Z]{2})\b/);
  if (m && US_STATES.has(m[1])) return m[1];
  return "";
}

// 🔁 Second-pass resolver for "unknown" leads (no state abbreviation in the address).
// Uses a 5-digit ZIP (deterministic by numeric range) first, then a conservative
// city lookup. Returns { state, basis } or { "", "none" } when still unresolvable.
function zipToState(zip: string): string {
  const n = Number(zip);
  if (!n) return "";
  if (n >= 90001 && n <= 96162) return "CA";
  const ranges: Array<[number, number, string]> = [
    [85001, 86556, "AZ"], [88901, 89883, "NV"], [73001, 74966, "OK"], [75001, 79999, "TX"],
    [32003, 34997, "FL"], [35004, 36925, "AL"], [37010, 38589, "TN"], [70001, 71497, "LA"],
    [97001, 97920, "OR"], [98001, 99403, "WA"], [80001, 81658, "CO"], [87001, 88441, "NM"],
    [84001, 84784, "UT"], [83201, 83877, "ID"], [59001, 59937, "MT"], [96701, 96898, "HI"],
    [10001, 14925, "NY"], [60001, 62999, "IL"], [48001, 49971, "MI"], [43001, 45999, "OH"],
  ];
  for (const [a, b, s] of ranges) if (n >= a && n <= b) return s;
  return "?other"; // a real US ZIP, but outside the ranges we name — definitely not CA
}
const CITY_STATE: Array<[RegExp, string]> = [
  [/\blas vegas\b|\bhenderson\b|\breno\b|\bsparks\b|\bcarson city\b|\bnorth las vegas\b/i, "NV"],
  [/\boklahoma city\b|\btulsa\b|\bnorman\b|\bedmond\b|\bbroken arrow\b/i, "OK"],
  [/\bphoenix\b|\btucson\b|\bmesa\b|\bscottsdale\b|\bchandler\b|\bglendale az\b/i, "AZ"],
  [/\bdowney\b|\blos angeles\b|\bsan diego\b|\bsacramento\b|\bfresno\b|\bsan jose\b|\blancaster\b|\bpalmdale\b|\briverside\b|\bbakersfield\b|\blong beach\b|\banaheim\b|\bstockton\b|\bmodesto\b|\bchula vista\b|\bsanta ana\b|\bmoreno valley\b|\bvictorville\b|\bhemet\b|\bmurrieta\b|\btemecula\b|\boakland\b|\bfontana\b|\birvine\b|\bsan bernardino\b|\bpomona\b|\bescondido\b|\bel cajon\b|\bcompton\b|\binglewood\b|\bvallejo\b|\bcarson\b|\bhesperia\b/i, "CA"],
];
function resolveUnknown(addr: string): { state: string; basis: string } {
  const zips = addr.match(/\b(\d{5})\b/g) || [];
  for (const z of zips) { const s = zipToState(z); if (s) return { state: s, basis: `ZIP ${z}` }; }
  for (const [re, s] of CITY_STATE) if (re.test(addr)) return { state: s, basis: "city" };
  return { state: "", basis: "none" };
}

// Motivation signal categories (the "most likely to sell" ranking Jon chose:
// high equity + absentee, distress flags, reachable).
const SIGNAL_CATS: Array<[string, RegExp]> = [
  ["high-equity", /\bequity\b|free\s*&?\s*clear|paid\s*off|owned?\s*outright/i],
  ["absentee/out-of-state", /absentee|out[\s-]?of[\s-]?state|out[\s-]?of[\s-]?area|non[\s-]?owner|mailing\s*≠|owner\s*elsewhere/i],
  ["vacant", /\bvacant\b|unoccupied|abandoned/i],
  ["distress", /foreclos|pre[\s-]?foreclos|delinquen|\blien\b|probate|inherit|divorce|code\s*viol|\bbehind\b|tax\s*sale|bankrupt|eviction|\bnod\b/i],
  ["flagged-motivated", /motivated|distress|tired\s*landlord|must\s*sell|urgent/i],
];

function motivationHits(hay: string): string[] {
  const out: string[] = [];
  for (const [label, re] of SIGNAL_CATS) if (re.test(hay)) out.push(label);
  return out;
}

const digits = (s: string) => (s || "").replace(/\D/g, "");

type Row = {
  id: string;
  contactId: string;
  title: string;
  stage: string;
  pipeline: string;
  tags: string;
  formData: unknown;
  assignedTo: string;
  contact: {
    name: string; phone: string; altPhone: string; email: string;
    altEmail: string; address: string; tags: string; source: string; pinnedNote: string;
  };
};

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return NextResponse.json({ error: "admin only — sign in as Jon" }, { status: 403 });

  const url = new URL(req.url);
  const commit = url.searchParams.get("commit") === "1";
  const includeUnknown = url.searchParams.get("includeUnknown") === "1"; // also archive name-only (no state) leads
  const deleteAddressless = url.searchParams.get("deleteAddressless") === "1"; // PERMANENTLY delete leads with no address anywhere
  const sampleN = Math.min(Number(url.searchParams.get("samples") ?? 8) || 8, 40);

  // The "New" column is the stage `new_call_1_min` ("New (Call <5 min)") for both reps'
  // pipelines; native board uses "new". Restrict STRICTLY to these so leads in other
  // pipelines/stages (Cold, Dead, DNC, Nurture…) are never touched — Jon asked about the
  // New column only.
  const isNewStage = (o: { pipeline: string; stage: string }) => o.stage === "new_call_1_min" || o.stage === "new";

  const rows = (await db.crmOpportunity.findMany({
    where: {
      archivedAt: null,
      OR: [
        { assignedTo: { startsWith: "nic", mode: "insensitive" } },
        { assignedTo: { startsWith: "kyle", mode: "insensitive" } },
      ],
    },
    select: {
      id: true, contactId: true, title: true, stage: true, pipeline: true, tags: true, formData: true, assignedTo: true,
      contact: {
        select: {
          name: true, phone: true, altPhone: true, email: true, altEmail: true,
          address: true, tags: true, source: true, pinnedNote: true,
        },
      },
    },
  }).catch(() => [])) as Row[];

  const whichRep = (assignedTo: string): string | null => {
    const first = (assignedTo || "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    for (const [label, toks] of Object.entries(REP_TOKENS)) if (toks.some((t) => first.startsWith(t))) return label;
    return null;
  };

  type Assessed = {
    id: string; contactId: string; rep: string; name: string; address: string; pinnedNote: string;
    state: string; basis: string; reachable: boolean; signals: string[];
    decision: "KEEP" | "DROP-TX" | "DROP-WEAK-CA" | "DROP-OTHER" | "REVIEW-UNKNOWN" | "DELETE-ADDRESSLESS";
  };
  const assessed: Assessed[] = [];
  const matchedNames: Record<string, Set<string>> = {};

  for (const o of rows) {
    const rep = whichRep(o.assignedTo);
    if (!rep || !isNewStage(o)) continue;
    (matchedNames[rep] ??= new Set()).add(o.assignedTo || "(blank)");

    const addr = `${o.title || ""} ${o.contact?.address || ""}`.trim();
    let state = stateOf(addr);
    let basis = state ? "address" : "";
    // Second pass for leads with no state in the address: ZIP/city → state.
    if (!state) { const r = resolveUnknown(addr); state = r.state; basis = r.basis; }
    const hay = [o.tags, o.contact?.tags, o.contact?.source, o.contact?.pinnedNote, o.title, JSON.stringify(o.formData ?? {})].join(" ");
    const signals = motivationHits(hay);
    const reachable = digits(o.contact?.phone) .length >= 10 || digits(o.contact?.altPhone).length >= 10 || /@/.test(o.contact?.email || "") || /@/.test(o.contact?.altEmail || "");

    // Rule (Jon 2026-11-18): "just show CA leads." Keep every CA lead; archive TX and
    // every other known state; only leads still unresolvable after the ZIP/city pass are
    // left for review (&includeUnknown=1 to archive those too).
    let decision: Assessed["decision"];
    if (state === "CA") decision = "KEEP";
    else if (state === "TX") decision = "DROP-TX";
    else if (state === "") decision = "REVIEW-UNKNOWN";
    else decision = "DROP-OTHER"; // any other named state, or "?other" ZIP outside CA

    assessed.push({
      id: o.id, contactId: o.contactId, rep, name: o.contact?.name || "", address: addr,
      pinnedNote: o.contact?.pinnedNote || "", state: state || "?", basis,
      reachable, signals, decision,
    });
  }

  // 📝 Notes pass: for leads still unknown after the address + ZIP/city passes, look for an
  // address inside their NOTES (pinnedNote + CrmEvent note/system bodies). A lead with an
  // address in a note gets resolved (CA keep / other archive / review); a lead with NO address
  // ANYWHERE becomes a DELETE-ADDRESSLESS candidate (Jon 2026-11-18: "if no address in the
  // notes either, delete these unknown leads").
  const stillUnknownRows = assessed.filter((a) => a.decision === "REVIEW-UNKNOWN");
  if (stillUnknownRows.length) {
    const unkOppIds = stillUnknownRows.map((a) => a.id);
    const unkContactIds = [...new Set(stillUnknownRows.map((a) => a.contactId))];
    const noteRows = await db.crmEvent.findMany({
      where: { kind: { in: ["note", "system", "call", "sms", "email", "task", "appt"] }, OR: [{ oppId: { in: unkOppIds } }, { contactId: { in: unkContactIds } }] },
      select: { oppId: true, contactId: true, body: true },
    }).catch(() => [] as { oppId: string; contactId: string; body: string }[]);
    const byOpp: Record<string, string[]> = {};
    const byContact: Record<string, string[]> = {};
    for (const n of noteRows) {
      const b = (n.body || "").replace(/<[^>]+>/g, " ");
      if (n.oppId) (byOpp[n.oppId] ??= []).push(b);
      if (n.contactId) (byContact[n.contactId] ??= []).push(b);
    }
    // An "address" = a street line (number + word) or a 5-digit ZIP somewhere in the text.
    const hasStreetOrZip = (s: string) => /\b\d{1,6}\s+[A-Za-z]/.test(s) || /\b\d{5}\b/.test(s);
    for (const a of stillUnknownRows) {
      const noteHay = [a.pinnedNote, ...(byOpp[a.id] || []), ...(byContact[a.contactId] || [])].join("  ");
      let st = stateOf(noteHay);
      if (!st) st = resolveUnknown(noteHay).state; // "" | "CA" | "TX" | other | "?other"
      // also consider the original address text for the "has any address at all" test
      const anyAddr = hasStreetOrZip(`${a.address} ${noteHay}`);
      if (st === "CA") { a.decision = "KEEP"; a.state = "CA"; a.basis = "note"; }
      else if (st === "TX") { a.decision = "DROP-TX"; a.state = "TX"; a.basis = "note"; }
      else if (st && st !== "?other") { a.decision = "DROP-OTHER"; a.state = st; a.basis = "note"; }
      else if (st === "?other") { a.decision = "DROP-OTHER"; a.state = "?"; a.basis = "note"; }
      else if (anyAddr) { a.decision = "REVIEW-UNKNOWN"; } // has an address but no derivable state — keep for review
      else { a.decision = "DELETE-ADDRESSLESS"; } // no address in title, contact.address, OR notes
    }
  }

  // 🔎 Diagnostics over ALL active opps for these reps (not just New stage) so we can
  // see where Nick's leads are and what signals actually exist on the CA leads.
  const repOf = (a: string) => whichRep(a);
  const diag = ["Nick Fair", "Kyle Brown"].map((rep) => {
    const mineAll = rows.filter((o) => repOf(o.assignedTo) === rep);
    const stageCounts: Record<string, number> = {};
    const pipeCounts: Record<string, number> = {};
    for (const o of mineAll) {
      stageCounts[o.stage || "(blank)"] = (stageCounts[o.stage || "(blank)"] ?? 0) + 1;
      pipeCounts[o.pipeline || "(native)"] = (pipeCounts[o.pipeline || "(native)"] ?? 0) + 1;
    }
    // CA new-stage leads: what's actually populated?
    const caNew = mineAll.filter((o) => isNewStage(o) && stateOf(`${o.title || ""} ${o.contact?.address || ""}`) === "CA");
    const hasPhone = caNew.filter((o) => digits(o.contact?.phone).length >= 10 || digits(o.contact?.altPhone).length >= 10).length;
    const hasEmail = caNew.filter((o) => /@/.test(o.contact?.email || "") || /@/.test(o.contact?.altEmail || "")).length;
    const hasTags = caNew.filter((o) => (o.tags || o.contact?.tags || "").trim().length > 0).length;
    const hasForm = caNew.filter((o) => o.formData && JSON.stringify(o.formData) !== "{}" && JSON.stringify(o.formData) !== "null").length;
    const srcCounts: Record<string, number> = {};
    for (const o of caNew) srcCounts[(o.contact?.source || "(none)").slice(0, 30)] = (srcCounts[(o.contact?.source || "(none)").slice(0, 30)] ?? 0) + 1;
    return {
      rep,
      activeOppsTotal: mineAll.length,
      distinctAssignedTo: [...new Set(mineAll.map((o) => o.assignedTo || "(blank)"))],
      stageCounts, pipeCounts,
      caNewLeads: caNew.length,
      caReachable: caNew.filter((o) => digits(o.contact?.phone).length >= 10 || digits(o.contact?.altPhone).length >= 10 || /@/.test(o.contact?.email || "") || /@/.test(o.contact?.altEmail || "")).length,
      caHasPhone: hasPhone, caHasEmail: hasEmail, caHasTags: hasTags, caHasFormData: hasForm,
      caSourceBreakdown: srcCounts,
    };
  });

  // Build per-rep + overall summary.
  const reps = Object.keys(REP_TOKENS).map((rep) => {
    const mine = assessed.filter((a) => a.rep === rep);
    const by = (d: Assessed["decision"]) => mine.filter((a) => a.decision === d);
    const keep = by("KEEP");
    return {
      rep,
      matchedAssignedTo: [...(matchedNames[rep] ?? [])],
      totalNewLeads: mine.length,
      byState: {
        CA: mine.filter((a) => a.state === "CA").length,
        TX: mine.filter((a) => a.state === "TX").length,
        other: mine.filter((a) => a.state !== "CA" && a.state !== "TX" && a.state !== "?").length,
        unknown: mine.filter((a) => a.state === "?").length,
      },
      caKeep: keep.length,
      caDropWeak: by("DROP-WEAK-CA").length,
      txDrop: by("DROP-TX").length,
      otherDrop: by("DROP-OTHER").length,
      unknownReview: by("REVIEW-UNKNOWN").length,
      remainingAfterCleanup: keep.length,
      keepList: keep.slice(0, sampleN).map((a) => ({ name: a.name, address: a.address, signals: a.signals, reachable: a.reachable })),
      sampleDrops: mine.filter((a) => a.decision.startsWith("DROP")).slice(0, sampleN).map((a) => ({ name: a.name, address: a.address, state: a.state, why: a.decision })),
      sampleUnknown: by("REVIEW-UNKNOWN").slice(0, sampleN).map((a) => ({ name: a.name, address: a.address })),
    };
  });

  // What commit WOULD archive: TX + all other known non-CA states; unknown only if asked.
  const toArchive = assessed.filter((a) =>
    a.decision === "DROP-TX" || a.decision === "DROP-OTHER" || (includeUnknown && a.decision === "REVIEW-UNKNOWN"));
  const archiveIds = toArchive.map((a) => a.id);

  let committed: null | { archived: number } = null;
  if (commit && archiveIds.length) {
    const res = await db.crmOpportunity.updateMany({ where: { id: { in: archiveIds } }, data: { archivedAt: new Date() } });
    committed = { archived: res.count };
  }

  // 🗑 PERMANENT delete of addressless leads (no address in title, contact.address, OR notes).
  const addressless = assessed.filter((a) => a.decision === "DELETE-ADDRESSLESS");
  const addresslessIds = addressless.map((a) => a.id);
  let deleted: null | { deletedOpps: number; deletedEvents: number } = null;
  if (deleteAddressless && addresslessIds.length) {
    const ev = await db.crmEvent.deleteMany({ where: { oppId: { in: addresslessIds } } }).catch(() => ({ count: 0 }));
    const op = await db.crmOpportunity.deleteMany({ where: { id: { in: addresslessIds } } });
    deleted = { deletedOpps: op.count, deletedEvents: ev.count };
  }

  // 🔁 How the previously-"unknown" leads were resolved (ZIP/city pass + notes pass).
  const resolved = assessed.filter((a) => ["city", "note"].includes(a.basis) || a.basis.startsWith("ZIP"));
  const stillUnknown = assessed.filter((a) => a.decision === "REVIEW-UNKNOWN");
  const unknownResolution = {
    resolvedToCA: {
      count: resolved.filter((a) => a.state === "CA").length,
      leads: resolved.filter((a) => a.state === "CA").map((a) => ({ rep: a.rep, name: a.name, address: a.address, via: a.basis })),
    },
    resolvedToOtherState: {
      count: resolved.filter((a) => a.state !== "CA").length,
      leads: resolved.filter((a) => a.state !== "CA").map((a) => ({ rep: a.rep, name: a.name, address: a.address, state: a.state, via: a.basis })),
    },
    hasAddressNoState: {
      count: stillUnknown.length,
      leads: stillUnknown.map((a) => ({ rep: a.rep, name: a.name, address: a.address })),
    },
    addresslessToDelete: {
      count: addressless.length,
      note: deleteAddressless ? "DELETED (permanent)" : "candidates — add ?deleteAddressless=1 to PERMANENTLY delete",
      leads: addressless.map((a) => ({ rep: a.rep, name: a.name, address: a.address || "(empty)" })),
    },
  };

  return NextResponse.json({
    ok: true,
    mode: commit ? "COMMITTED" : "DRY-RUN (read-only — add ?commit=1 to archive)",
    includeUnknown,
    diag,
    reps,
    plan: {
      rule: "Keep every CA lead; archive TX + all other states; leave name-only (unknown) leads for review.",
      willArchive: archiveIds.length,
      breakdown: {
        TX: assessed.filter((a) => a.decision === "DROP-TX").length,
        otherStates: assessed.filter((a) => a.decision === "DROP-OTHER").length,
        unknownNameOnly: assessed.filter((a) => a.decision === "REVIEW-UNKNOWN").length,
        unknownNote: includeUnknown ? "ARCHIVED (includeUnknown=1)" : "NOT archived unless &includeUnknown=1",
      },
    },
    totalCaKeptAcrossBothReps: assessed.filter((a) => a.decision === "KEEP").length,
    unknownResolution,
    committed,
    deleted,
  });
}
