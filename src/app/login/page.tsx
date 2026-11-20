import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionEmail, getCurrentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  // Already signed in → don't show the login form wrapped in the user's own shell
  // (Jon 2026-11-19). Bounce to where they were headed, or the dashboard.
  const email = await getSessionEmail().catch(() => null);
  const me = email ? await getCurrentUser().catch(() => null) : null;
  if (me?.active) {
    const next = (await searchParams)?.next;
    redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
  }
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
