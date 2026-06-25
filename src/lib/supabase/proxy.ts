// Session refresh + route gating for proxy.ts (Next 16's middleware replacement).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes reachable WITHOUT a session (login flow, wall display, machine webhooks).
const PUBLIC_PATHS = ["/login", "/auth", "/tv", "/api/ingest", "/api/cron", "/api/speedtest", "/api/tickets", "/api/suggestions", "/api/recording", "/api/dbcheck", "/manifest.webmanifest", "/icon", "/apple-icon"];

export async function updateSession(request: NextRequest) {
  // Expose the current path to server components (AppShell route guard reads it).
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-pathname", request.nextUrl.pathname);
  let response = NextResponse.next({ request: { headers: reqHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: reqHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return response;
}
