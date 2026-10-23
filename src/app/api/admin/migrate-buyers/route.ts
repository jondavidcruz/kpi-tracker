import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isCSuitePerson } from "@/lib/auth";
import { migrateBuyers } from "@/lib/buyer-migrate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 🔀 Phase-2 buyer migration (Jon triggers). C-suite only. Default is a DRY RUN that
// reports what WOULD migrate; add ?mode=go to actually create the CRM opportunities.
//   dry:  https://kpi-tracker-lovat.vercel.app/api/admin/migrate-buyers
//   go:   https://kpi-tracker-lovat.vercel.app/api/admin/migrate-buyers?mode=go
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!isCSuitePerson(me)) return NextResponse.json({ error: "forbidden — C-suite only" }, { status: 403 });
  const execute = req.nextUrl.searchParams.get("mode") === "go";
  try {
    const plan = await migrateBuyers(execute);
    return NextResponse.json(plan);
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
