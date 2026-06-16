// Service-role Supabase client for admin operations (setting team passwords).
// Uses SUPABASE_SERVICE_ROLE_KEY — a server-only secret (never NEXT_PUBLIC).
// Only ever called from admin-gated server actions.
import { createClient } from "@supabase/supabase-js";

export function adminConfigured(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Find a Supabase auth user by email (case-insensitive). Pages through users. */
export async function findAuthUserByEmail(email: string): Promise<string | null> {
  const admin = createAdminClient();
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 100) return null; // last page
  }
  return null;
}
