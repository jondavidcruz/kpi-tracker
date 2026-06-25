import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

// TEMP diagnostic (no auth) — reproduces the authenticated pages' DB load to surface the
// real error. Remove after debugging.
export async function GET() {
  const out: Record<string, unknown> = { ok: true, steps: [] as unknown[] };
  const steps = out.steps as unknown[];
  try {
    let t = Date.now();
    await getSettings(); steps.push({ getSettings: "ok", ms: Date.now() - t });
    t = Date.now();
    const users = await db.user.count(); steps.push({ userCount: users, ms: Date.now() - t });
    t = Date.now();
    const par = await Promise.all([db.kpi.count(), db.entry.count(), db.user.count(), db.alert.count(), db.deal.count()]);
    steps.push({ parallel: par, ms: Date.now() - t });
  } catch (e) {
    out.ok = false;
    out.error = String((e as Error)?.message ?? e);
    out.name = String((e as { name?: string })?.name ?? "");
    out.code = String((e as { code?: string })?.code ?? "");
  }
  return NextResponse.json(out);
}
