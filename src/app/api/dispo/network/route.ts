import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, canAccessMarketing, isManager } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAgentNetworkName } from "@/lib/dispo-buyers";
import { resolveNetworkPipelines } from "@/lib/dispo-network";

// 🔎 Search the Buyer-Network CRM (developers + buyer agents) to ATTACH to a deal
// (Jon 2026-10-20). Returns the top matches for a typed query / the deal's area.
// Fix (Jon 2026-10-22): buyer AGENTS were getting crowded out — with ~320 devs and
// ~40 agents, an empty/area search returned 25 rows that were almost all developers,
// so agents "weren't loading." We now pull each pipeline separately and BALANCE the
// result so agents always show, and respect a `kind` filter (all / agent / developer).
type Row = { id: string; title: string; pipeline: string; formData: unknown; contact: { name: string | null; phone: string | null; email: string | null; pinnedNote: string | null } | null };

function shape(o: Row) {
  const imp = ((o.formData ?? {}) as { __import?: { market?: string; buyBox?: string } }).__import ?? {};
  const area = imp.market || "";
  const buyBox = imp.buyBox || o.contact?.pinnedNote || "";
  return { id: o.id, name: o.contact?.name || o.title, phone: o.contact?.phone || "", email: o.contact?.email || "", area, buyBox, kind: isAgentNetworkName(o.pipeline) ? "buyer_agent" : "developer" };
}

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me) && !isManager(me)) return NextResponse.json({ results: [] }, { status: 403 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const kind = req.nextUrl.searchParams.get("kind") ?? ""; // "agent" | "developer" | ""
  const wantAgents = kind !== "developer";
  const wantDevs = kind !== "agent";

  // 🔎 Push the name/phone search INTO the query so it hits the WHOLE pipeline, not just the
  // 400 most-recently-updated (Jon 2026-10-27: "dsld" found nothing because DSLD Homes wasn't
  // in that recent window out of 1,100+ developers).
  const qDigits = q.replace(/\D/g, "");
  const pull = async (pipelines: string[]) => pipelines.length ? (await db.crmOpportunity.findMany({
    where: {
      archivedAt: null, pipeline: { in: pipelines },
      ...(q ? { OR: [
        { title: { contains: q, mode: "insensitive" } },
        { contact: { is: { name: { contains: q, mode: "insensitive" } } } },
        ...(qDigits.length >= 4 ? [{ contact: { is: { phone: { contains: qDigits } } } }] : []),
      ] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 400,
    select: { id: true, title: true, pipeline: true, formData: true, contact: { select: { name: true, phone: true, email: true, pinnedNote: true } } },
  }).catch(() => [])) as Row[] : [];

  const net = await resolveNetworkPipelines();
  const [agentRows, devRows] = await Promise.all([
    wantAgents ? pull(net.agent) : Promise.resolve([] as Row[]),
    wantDevs ? pull(net.dev) : Promise.resolve([] as Row[]),
  ]);

  // The DB query already applied the search; just shape the rows.
  const agents = agentRows.map(shape);
  const devs = devRows.map(shape);

  // Balance: give agents a guaranteed share so they never get buried under developers.
  // Agents first (they're dispo's daily-priority buyers), then developers, up to 30.
  const CAP = 30;
  const results = [...agents.slice(0, Math.max(12, Math.ceil(CAP / 2))), ...devs].slice(0, CAP);

  return NextResponse.json({ results, counts: { agents: agents.length, developers: devs.length } });
}
