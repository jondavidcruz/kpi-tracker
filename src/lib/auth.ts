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

// C-Suite + sensitive data (financials/P&L, payroll & pay amounts, roadmap, team roster,
// war-room health) is HARD-LIMITED to these three people by name. No per-user toggle can
// grant it to anyone else, and any new hire never gets it by default. To change who can
// see sensitive data, edit this set — nothing else grants it.
const CSUITE_PEOPLE = new Set(["jon", "enrico", "viktoriia"]);
function firstNameOf(user: { name?: string } | null): string {
  return (user?.name ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}
/** Is this person one of the three sensitive-data owners (Jon, Enrico, Viktoriia)? */
export function isCSuitePerson(user: { name?: string } | null): boolean {
  return CSUITE_PEOPLE.has(firstNameOf(user));
}

/** Can see PAY ($ rates, gross, bonuses, totals). Locked to Jon/Enrico/Viktoriia. */
export function canAccessPayroll(user: User | null): boolean {
  return isCSuitePerson(user);
}

/** Can open the Time Card (track hours). Managers (Marie + Jon) + pay staff. */
export function canTrackTime(user: User | null): boolean {
  return isManager(user) || canAccessPayroll(user);
}

/** Can see the C-Suite section (financials, roadmap, roster) + sensitive data.
 *  Locked to Jon/Enrico/Viktoriia by name — no toggle grants it to anyone else. */
export function canAccessCSuite(user: User | null): boolean {
  return isCSuitePerson(user);
}

// Restricted users see ONLY these page prefixes (first = their home page).
// Ethan is part-time, listings-only — no acquisitions scorecard, just his pipeline.
const RESTRICTED_NAV: Record<string, string[]> = {
  ethan: ["/deals", "/process", "/underwriting", "/schedule", "/rewards", "/call-scoring", "/scripts", "/account"],
  // Nicholas Fair — access controlled by Jon in Admin → Access preview (per-user navHidden),
  // so he can pick sections himself rather than a hardcoded allowlist.
};

// A person still in the onboarding ramp only sees learning + day-to-day basics — none
// of the rest of the War Room — until the owner certifies them (clears `onboarding`).
// First entry is their landing page when they hit anything disallowed.
export const ONBOARDING_NAV: string[] = [
  "/training", "/glossary", "/scripts", "/playbooks",
  "/process", "/entry", "/call-scoring", "/account",
];

/** Allowed page prefixes for a restricted user, or null if they see everything. */
export function navAllowlist(user: { name: string; onboarding?: boolean } | null): string[] | null {
  if (!user) return null;
  if (isManager(user as User)) return null; // managers/admin are never restricted
  if (user.onboarding) return ONBOARDING_NAV; // onboarding ramp → learning + basics only
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
