import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const BUCKET = "call-recordings";

/** Hands the browser a one-time signed URL so it can upload a recording straight
 *  to Supabase Storage — bypassing Vercel's ~4.5 MB request limit. Returns the
 *  path + token to upload to, and the public URL to play it back from. */
export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!adminConfigured()) return NextResponse.json({ error: "Recording storage isn't set up (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 400 });

  let body: { ext?: string };
  try { body = await request.json(); } catch { body = {}; }
  const ext = (String(body.ext || "m4a").replace(/[^a-z0-9]/gi, "").slice(0, 5)) || "m4a";

  const admin = createAdminClient();
  // Ensure the bucket exists (idempotent — ignore "already exists").
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const path = `calls/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: "Couldn't start the upload — try again." }, { status: 500 });

  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  return NextResponse.json({ path: data.path, token: data.token, publicUrl });
}
