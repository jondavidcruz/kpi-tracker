import { NextResponse } from "next/server";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { computeHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

/** System health — owner only (drives the status light next to the logo). */
export async function GET() {
  const me = await getCurrentUser();
  if (!isOwner(me)) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  return NextResponse.json(await computeHealth());
}
