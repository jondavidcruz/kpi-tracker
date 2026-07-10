import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser, canAccessMarketing } from "@/lib/auth";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const BUCKET = "buybox-maps";

/** Signed URL so the browser can upload a buyer's buy-box area map (the detailed map Sharyn
 *  makes) straight to Supabase Storage. Anyone who can manage buyers can upload. */
export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me || !canAccessMarketing(me)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!adminConfigured()) return NextResponse.json({ error: "Image storage isn't set up (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 400 });

  let body: { ext?: string };
  try { body = await request.json(); } catch { body = {}; }
  const ext = (String(body.ext || "png").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "png").toLowerCase();

  const admin = createAdminClient();
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const path = `maps/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: "Couldn't start the upload — try again." }, { status: 500 });

  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  return NextResponse.json({ path: data.path, token: data.token, publicUrl });
}
