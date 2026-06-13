// Clears the Supabase session and returns to login. Used by the NavBar lockout
// when a removed/deactivated account still has a live session, and anywhere we
// need a plain GET sign-out link.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login?removed=1", request.url));
}
