// Bridges Supabase Auth (who is logged in) to the app's User table (their role).
import { cache } from "react";
import { createClient } from "./supabase/server";
import { db } from "./db";
import type { User } from "@prisma/client";

/** The signed-in email, or null. Cached per request — called many times per page. */
export const getSessionEmail = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email?.toLowerCase() ?? null;
});

/** The app User row matching the signed-in email, or null if not provisioned.
 *  Cached per request: the shell + page + many helpers all call this, so without the
 *  cache it was hitting the DB a dozen+ times on a single page load. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const email = await getSessionEmail();
  if (!email) return null;
  return db.user.findUnique({ where: { email } });
});

export function isManager(user: User | null): boolean {
  return !!user && (user.role === "manager" || user.role === "admin");
}

/** Admin only (currently just Jon) — for owner-private views like rep reviews. */
export function isAdmin(user: User | null): boolean {
  return !!user && user.role === "admin";
}

// Reps (beyond managers/admin) allowed to curate the Software & Logins directory.
// Matched by first name, case-insensitive. Edit this list to change who can add/
// edit software entries without changing their global role.
const SOFTWARE_CURATORS = ["sharyn", "marie"];

/** Can add/edit/delete entries in the Software & Logins directory. */
export function canCurateSoftware(user: User | null): boolean {
  if (!user) return false;
  if (isManager(user)) return true; // managers + admin
  const first = user.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return SOFTWARE_CURATORS.includes(first);
}

/** Can view + edit the Marketing section. Editable per-user (Admin → Access preview). */
export function canAccessMarketing(user: User | null): boolean {
  return !!user?.accessMarketing;
}

/** Can see PAY ($ rates, gross, bonuses, totals). Editable per-user. */
export function canAccessPayroll(user: User | null): boolean {
  return !!user?.accessPayroll;
}

/** Can open the Time Card (track hours). Managers (Marie + Jon) + pay staff. */
export function canTrackTime(user: User | null): boolean {
  return isManager(user) || canAccessPayroll(user);
}

/** Can see the C-Suite section (financials, roadmap, roster). Editable per-user
 *  (Admin → Access preview), so it's excluded even from other admins/managers like Marie. */
export function canAccessCSuite(user: User | null): boolean {
  return !!user?.accessCsuite;
}

// Restricted users see ONLY these page prefixes (first = their home page).
// Ethan is part-time, listings-only — no acquisitions scorecard, just his pipeline.
const RESTRICTED_NAV: Record<string, string[]> = {
  ethan: ["/deals", "/process", "/underwriting", "/schedule", "/rewards", "/call-scoring", "/scripts", "/account"],
};

/** Allowed page prefixes for a restricted user, or null if they see everything. */
export function navAllowlist(user: { name: string } | null): string[] | null {
  if (!user) return null;
  if (isManager(user as User)) return null; // managers/admin are never restricted
  const first = user.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return RESTRICTED_NAV[first] ?? null;
}

/** True if `path` is reachable under the given allowlist (always allow auth/api). */
export function isPathAllowed(path: string, allow: string[]): boolean {
  if (path.startsWith("/auth") || path.startsWith("/api")) return true;
  return allow.some((p) => path === p || path.startsWith(p + "/"));
}

/** The owner (Jon). Not a tracked employee — no personal time card / not on the board. */
export function isOwner(user: { name: string } | null): boolean {
  if (!user) return false;
  return (user.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "") === "jon";
}
