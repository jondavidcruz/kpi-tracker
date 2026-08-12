import { getCurrentUser, isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Owner-only: safely report whether DATABASE_URL uses the connection pooler,
// WITHOUT ever exposing the password. Lets us verify the fast-path setup.
export async function GET() {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return new Response("Forbidden", { status: 403 });

  const raw = process.env.DATABASE_URL || "";
  let host = "", port = "";
  try {
    const u = new URL(raw.replace(/^postgres(ql)?:\/\//i, "http://"));
    host = u.hostname;
    port = u.port || "5432";
  } catch { /* unparseable */ }

  const isPooler = /pooler\.supabase\.com/i.test(host) || port === "6543";
  const region = (host.match(/(us|eu|ap|sa)-[a-z]+-\d/i)?.[0]) || "unknown";
  const directUrlSet = Boolean(process.env.DIRECT_URL);

  return Response.json({
    databaseHost: host || "(couldn't parse)",
    port,
    region,
    isPooler,
    directUrlConfigured: directUrlSet,
    verdict: isPooler
      ? "✓ DATABASE_URL uses the connection pooler — good for Vercel."
      : "⚠️ This looks like a DIRECT connection (not the pooler). Switch DATABASE_URL to Supabase's Transaction pooler string for speed/reliability.",
    note: "Password is never shown. Region should ideally be us-west to match the app (now on sfo1).",
  });
}
