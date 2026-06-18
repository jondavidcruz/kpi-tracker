import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fetchComps } from "@/lib/comps";

export const dynamic = "force-dynamic";

/** Address → ARV estimate + comparable sales for the underwriting calculator. */
export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const address = (new URL(request.url).searchParams.get("address") ?? "").trim();
  if (address.length < 6) return NextResponse.json({ configured: true, comps: [], error: "Enter the full subject address first." });

  const result = await fetchComps(address);
  return NextResponse.json(result);
}
