// Authenticated app shell: left sidebar + content. Also enforces the lockout
// (removed/deactivated accounts are signed out). Login and the public wall
// display render without chrome.
import { redirect } from "next/navigation";
import { getSessionEmail, getCurrentUser, isManager, isAdmin, canAccessMarketing } from "@/lib/auth";
import { db } from "@/lib/db";
import Sidebar from "./Sidebar";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const email = await getSessionEmail();
  const me = email ? await getCurrentUser() : null;

  // Removed/deactivated account with a lingering session → sign out.
  if (email && (!me || !me.active)) redirect("/auth/signout");

  // Not signed in (login page) → no chrome.
  if (!me) return <>{children}</>;

  const manager = isManager(me);
  const admin = isAdmin(me);
  const marketing = canAccessMarketing(me);
  const [newTickets, newSuggestions] = await Promise.all([
    manager ? db.ticket.count({ where: { status: "new" } }) : Promise.resolve(0),
    admin ? db.suggestion.count({ where: { status: "proposed" } }) : Promise.resolve(0),
  ]);

  return (
    <div className="md:flex md:min-h-screen">
      <Sidebar name={me.name} manager={manager} admin={admin} marketing={marketing} newTickets={newTickets} newSuggestions={newSuggestions} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1320px] px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}
