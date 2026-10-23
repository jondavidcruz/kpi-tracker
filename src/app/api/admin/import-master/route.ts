import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isCSuitePerson } from "@/lib/auth";
import { importMaster } from "@/lib/master-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 🔀 Import the MASTER unvetted-buyer list into the kanban. C-suite only. Default = DRY
// RUN (checks against kanban + Buyer Research, reports new vs already-have); ?mode=go
// executes. Run /api/admin/add-dev-hot-stage first so the 🔥 Hot column exists.
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!isCSuitePerson(me)) return NextResponse.json({ error: "forbidden — C-suite only" }, { status: 403 });
  try {
    return NextResponse.json(await importMaster(req.nextUrl.searchParams.get("mode") === "go"));
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
