// Next.js 16 proxy (formerly middleware). Refreshes the Supabase session on every
// request and redirects unauthenticated users to /login.
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on all paths except Next internals and static assets. sw.js and the
    // manifest MUST be excluded: browsers refuse a service-worker script that
    // answers with a redirect (the login 307 broke push registration, 2026-10-12).
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
