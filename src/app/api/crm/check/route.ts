import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { reiReplyConfigured, listCrmUsers } from "@/lib/reireply";

export const dynamic = "force-dynamic";

// Admin-only REI Reply connection test. Open this URL while signed in as Jon to
// verify the key works and to see the CRM user list (for mapping agents → reps).
export async function GET() {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return NextResponse.json({ error: "admin only — sign in as Jon" }, { status: 403 });

  const hasKey = Boolean(process.env.REIREPLY_API_KEY);
  const hasLocation = Boolean(process.env.REIREPLY_LOCATION_ID);
  if (!reiReplyConfigured()) {
    return NextResponse.json({
      ok: false,
      hasKey,
      hasLocation,
      hint: "Add REIREPLY_API_KEY and REIREPLY_LOCATION_ID in Vercel → Settings → Environment Variables, then redeploy.",
    });
  }

  const r = await listCrmUsers();
  if (!r.ok) {
    return NextResponse.json({
      ok: false,
      status: r.status,
      error: r.raw,
      hint: r.status === 401 || r.status === 403
        ? "Token rejected — check the Private Integration scopes (need users.readonly) and that the token was copied fully."
        : "Connected to REI Reply but the users call failed — check the Location ID.",
    });
  }

  return NextResponse.json({
    ok: true,
    message: "✅ Connected to REI Reply. Map these agents to your reps and tell me.",
    userCount: r.users.length,
    users: r.users,
  });
}
