// 🏆 Owner-gated endpoint for the Vetted Buyers → kanban migration (Phase 2).
// Safe by default: a bare GET is a DRY RUN that writes nothing. ?run=1 executes,
// ?undo=1 reverses. Gated to Jon (owner session) OR Bearer/`?secret=` CRON_SECRET.
import { NextResponse } from "next/server";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { planMigration, runMigration, undoMigration, auditVetted, runVetAudit, undoVetAudit, auditDupes, runDedup, undoDedup, sweepOrphansDry, runOrphanSweep, undoOrphanSweep, sweepOrphanContactsDry, runSweepOrphanContacts } from "@/lib/buyer-migration";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) { return GET(request); }

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const bySecret = !!secret && (auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret);

  const me = await getCurrentUser().catch(() => null);
  if (!bySecret && !isOwner(me)) {
    return NextResponse.json({ error: "owner only" }, { status: 403 });
  }
  const actor = me?.name ?? "owner";

  try {
    // 🧹 Orphan sweep (unvetted research-pool buyers → kanban) — Jon 2026-10-27
    if (url.searchParams.get("sweep") === "1") return NextResponse.json(await sweepOrphansDry());
    if (url.searchParams.get("sweepgo") === "1") return NextResponse.json(await runOrphanSweep(actor));
    if (url.searchParams.get("undosweep") === "1") return NextResponse.json(await undoOrphanSweep());
    if (url.searchParams.get("orphans") === "1") return NextResponse.json(await sweepOrphanContactsDry());
    if (url.searchParams.get("orphansgo") === "1") return NextResponse.json(await runSweepOrphanContacts());
    // 🧹 De-dup twin cards — Jon 2026-10-27
    if (url.searchParams.get("dedup") === "1") return NextResponse.json(await auditDupes());
    if (url.searchParams.get("dedupgo") === "1") return NextResponse.json(await runDedup(actor));
    if (url.searchParams.get("undodedup") === "1") return NextResponse.json(await undoDedup());
    // 🔎 Vetted audit (empty-buy-box demotion) — Jon 2026-10-27
    if (url.searchParams.get("audit") === "1") return NextResponse.json(await auditVetted());
    if (url.searchParams.get("demote") === "1") return NextResponse.json(await runVetAudit(actor));
    if (url.searchParams.get("undoaudit") === "1") return NextResponse.json(await undoVetAudit());
    // 🏆 Migration
    if (url.searchParams.get("undo") === "1") return NextResponse.json(await undoMigration(actor));
    if (url.searchParams.get("run") === "1") return NextResponse.json(await runMigration(actor));
    return NextResponse.json(await planMigration()); // default = dry run
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
