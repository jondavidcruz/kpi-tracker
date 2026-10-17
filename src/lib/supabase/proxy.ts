// Session refresh + route gating for proxy.ts (Next 16's middleware replacement).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes reachable WITHOUT a session (login flow, wall display, machine webhooks).
const PUBLIC_PATHS = ["/login", "/auth", "/assess", "/offer", "/api/intake", "/api/buyer-intake", "/tv", "/api/ingest", "/api/cron", "/api/version", "/api/packet", "/api/backup", "/api/buyers-admin", "/api/speedtest", "/api/tickets", "/api/suggestions", "/api/recording", "/api/cascade", "/api/telco-alert", "/api/telnyx/call", "/api/telnyx/sms", "/api/kpi-image", "/api/resend/events", "/api/pandadoc/events", "/manifest.webmanifest", "/icon", "/apple-icon"];

export async function updateSession(request: NextRequest) {
  // Expose the current path to server components (AppShell route guard reads it).
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-pathname", request.nextUrl.pathname);
  // 🕵️ Member Preview "view as": only honor ?viewas on GET (never on POST/server
  // actions). Strip any client-forged x-viewas header first, then set it from the
  // query. getCurrentUser enforces that the REAL user is an admin before it takes
  // effect, so this cannot escalate privilege.
  reqHeaders.delete("x-viewas");
  const viewAs = request.nextUrl.searchParams.get("viewas");
  if (viewAs && request.method === "GET") reqHeaders.set("x-viewas", viewAs);
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
