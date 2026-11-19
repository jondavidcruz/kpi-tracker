import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { readPipelines } from "@/lib/crm";

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
  const sampleN = Math.min(Number(url.searchParams.get("samples") ?? 8) || 8, 40);

  // First stage key per pipeline → defines each rep's "New" column.
  const pipes = await readPipelines().catch(() => []);
  const firstKeyByPipe = new Map<string, string>(pipes.map((p) => [p.name, p.stages[0]?.key ?? "new"]));
  const isNewStage = (o: { pipeline: string; stage: string }) => {
    const fk = firstKeyByPipe.get(o.pipeline || "War Room") ?? "new";
    return o.stage === fk || o.stage === "new" || /(^|_)new($|_)|new\s*lead/i.test(o.stage);
  };

  const rows = (await db.crmOpportunity.findMany({
    where: {
      archivedAt: null,
      OR: [
        { assignedTo: { startsWith: "nic", mode: "insensitive" } },
        { assignedTo: { startsWith: "kyle", mode: "insensitive" } },
      ],
    },
    select: {
      id: true, title: true, stage: true, pipeline: true, tags: true, formData: true, assignedTo: true,
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
    id: string; rep: string; name: string; address: string; state: string;
    reachable: boolean; signals: string[]; decision: "KEEP" | "DROP-TX" | "DROP-WEAK-CA" | "DROP-OTHER" | "REVIEW-UNKNOWN";
  };
  const assessed: Assessed[] = [];
  const matchedNames: Record<string, Set<string>> = {};

  for (const o of rows) {
    const rep = whichRep(o.assignedTo);
    if (!rep || !isNewStage(o)) continue;
    (matchedNames[rep] ??= new Set()).add(o.assignedTo || "(blank)");

    const addr = `${o.title || ""} ${o.contact?.address || ""}`.trim();
    const state = stateOf(addr);
    const hay = [o.tags, o.contact?.tags, o.contact?.source, o.contact?.pinnedNote, o.title, JSON.stringify(o.formData ?? {})].join(" ");
    const signals = motivationHits(hay);
    const reachable = digits(o.contact?.phone) .length >= 10 || digits(o.contact?.altPhone).length >= 10 || /@/.test(o.contact?.email || "") || /@/.test(o.contact?.altEmail || "");

    // Rule (Jon 2026-11-18): "just show CA leads." Keep every CA lead; archive TX and
    // every other known state; name-only leads with no detectable state are left for review
    // (could be CA) unless &includeUnknown=1. Motivation signals don't exist in this raw
    // GHL-imported data, so there is no "weak CA" bucket — all CA stays.
    let decision: Assessed["decision"];
    if (state === "CA") decision = "KEEP";
    else if (state === "TX") decision = "DROP-TX";
    else if (state === "") decision = "REVIEW-UNKNOWN";
    else decision = "DROP-OTHER";

    assessed.push({
      id: o.id, rep, name: o.contact?.name || "", address: addr, state: state || "?",
      reachable, signals, decision,
    });
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
    committed,
  });
}
