// Culture was folded into the Schedule page so the team sees it daily (Jon 2026-11-05).
// Keep the old route working — redirect to the Culture section on /schedule.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function CulturePage() {
  redirect("/schedule#culture");
}
