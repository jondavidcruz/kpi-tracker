import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isCSuitePerson } from "@/lib/auth";
import { isDevNetworkName } from "@/lib/dispo-buyers";

export const dynamic = "force-dynamic";

// 🔥 Add a "Hot" stage to the DS: Developers pipeline (Jon 2026-10-22: a column for
// the most important developers he's trying to snag). C-suite only, idempotent.
//   https://kpi-tracker-lovat.vercel.app/api/admin/add-dev-hot-stage
const PIPES_CAT = "__crm_pipelines__";

export async function GET() {
  const me = await getCurrentUser();
  if (!isCSuitePerson(me)) return NextResponse.json({ error: "forbidden — C-suite only" }, { status: 403 });

  const row = await db.resource.findFirst({ where: { category: PIPES_CAT } });
  if (!row) return NextResponse.json({ error: "no pipelines resource found" }, { status: 404 });
  let pipes: Array<{ name: string; stages: Array<{ key: string; label: string }> }> = [];
  try { pipes = JSON.parse(row.description || "[]"); } catch { return NextResponse.json({ error: "pipelines JSON unreadable" }, { status: 500 }); }

  // the real DS: Developers pipeline (not the "unvetted" one)
  const dev = pipes.find((p) => isDevNetworkName(p.name) && !/unvetted/i.test(p.name));
  if (!dev) return NextResponse.json({ error: "DS: Developers pipeline not found", pipelines: pipes.map((p) => p.name) }, { status: 404 });

  if (dev.stages.some((s) => s.key === "hot")) {
    return NextResponse.json({ ok: true, already: true, pipeline: dev.name, stages: dev.stages.map((s) => s.label) });
  }
  // put 🔥 Hot first so the top targets lead the board
  dev.stages.unshift({ key: "hot", label: "🔥 Hot" });
  await db.resource.update({ where: { id: row.id }, data: { description: JSON.stringify(pipes) } });
  return NextResponse.json({ ok: true, added: true, pipeline: dev.name, stages: dev.stages.map((s) => s.label) });
}
