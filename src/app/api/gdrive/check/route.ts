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
  if (!check.ok) {
    const isJsonErr = /JSON|Unexpected token/i.test(check.error ?? "");
    return NextResponse.json({
      ok: false,
      error: check.error,
      hint: isJsonErr
        ? "GOOGLE_SERVICE_ACCOUNT_JSON must be the ENTIRE contents of the downloaded .json key file (the whole {…} object), not the service-account email. Re-paste it in Vercel and redeploy."
        : "Couldn't reach the folder — confirm GDRIVE_FOLDER_ID is the Shared Drive ID and the service-account email is a Content manager on it.",
    });
  }

  if (new URL(request.url).searchParams.get("migrate") === "1") {
    const res = await migrateRecordingsToDrive();
    return NextResponse.json({ ok: true, folder: check.folder, migrated: res });
  }
  return NextResponse.json({ ok: true, folder: check.folder, message: "✅ Connected. Add ?migrate=1 to move recordings now, or wait for the nightly job." });
}
