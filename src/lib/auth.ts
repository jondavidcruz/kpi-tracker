// Bridges Supabase Auth (who is logged in) to the app's User table (their role).
import { createClient } from "./supabase/server";
import { db } from "./db";
import type { User } from "@prisma/client";

/** The signed-in email, or null. */
export async function getSessionEmail(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email?.toLowerCase() ?? null;
}

/** The app User row matching the signed-in email, or null if not provisioned. */
export async function getCurrentUser(): Promise<User | null> {
  const email = await getSessionEmail();
  if (!email) return null;
  return db.user.findUnique({ where: { email } });
}

export function isManager(user: User | null): boolean {
  return !!user && (user.role === "manager" || user.role === "admin");
}

/** Admin only (currently just Jon) — for owner-private views like rep reviews. */
export function isAdmin(user: User | null): boolean {
  return !!user && user.role === "admin";
}
