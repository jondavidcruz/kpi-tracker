import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// 🚫 Buyer Research retired (Jon 2026-10-27): the Developers/Agents kanban is the single
// home for vetting now, and the vetted buyers live on /marketing. Old links land on the
// Developers kanban.
export default async function VettingPage() {
  redirect("/dispo?tab=developers");
}
