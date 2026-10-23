import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isCSuitePerson } from "@/lib/auth";
import { importDuong } from "@/lib/duong-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 🔥 Import the Jon Duong / Upland Capital buyer list into the DS: Developers "Hot"
// stage. C-suite only. Default = DRY RUN (reports what's already here vs new); add
// ?mode=go to create. Run /api/admin/add-dev-hot-stage first so the Hot column exists.
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!isCSuitePerson(me)) return NextResponse.json({ error: "forbidden — C-suite only" }, { status: 403 });
  try {
    return NextResponse.json(await importDuong(req.nextUrl.searchParams.get("mode") === "go"));
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
