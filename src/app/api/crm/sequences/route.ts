import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { DRIP_SEQUENCES, STAGE_SEQ } from "@/lib/drip";

export const dynamic = "force-dynamic";

// 📨 The automation sequences (keys, names, auto-send flag, and the exact steps) so the deal modal's
// "Start sequence" control can preview the cadence + messages in place — no navigating to /sequences.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "no access" }, { status: 403 });
  const seqs = DRIP_SEQUENCES.map((s) => ({ key: s.key, name: s.name, autoSend: s.autoSend === true, steps: s.steps }));
  return NextResponse.json({ seqs }, { headers: { "Cache-Control": "private, max-age=120" } });
}
