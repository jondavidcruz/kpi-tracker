import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { gdriveConfigured, driveCheck } from "@/lib/gdrive";
import { migrateRecordingsToDrive } from "@/lib/recording-migrate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Admin-only. Verifies the Drive service account + Shared Drive folder. Add
// ?migrate=1 to move a batch of recordings from Supabase to Drive on demand.
export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return NextResponse.json({ error: "admin only" }, { status: 403 });

  const hasJson = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const hasFolder = Boolean(process.env.GDRIVE_FOLDER_ID);
  if (!gdriveConfigured()) {
    return NextResponse.json({ ok: false, hasServiceAccount: hasJson, hasFolderId: hasFolder, hint: "Set GOOGLE_SERVICE_ACCOUNT_JSON + GDRIVE_FOLDER_ID in Vercel, then redeploy." });
  }
  const check = await driveCheck();
  if (!check.ok) return NextResponse.json({ ok: false, error: check.error, hint: "Share the Shared Drive folder with the service-account email as Content manager." });

  if (new URL(request.url).searchParams.get("migrate") === "1") {
    const res = await migrateRecordingsToDrive();
    return NextResponse.json({ ok: true, folder: check.folder, migrated: res });
  }
  return NextResponse.json({ ok: true, folder: check.folder, message: "✅ Connected. Add ?migrate=1 to move recordings now, or wait for the nightly job." });
}
