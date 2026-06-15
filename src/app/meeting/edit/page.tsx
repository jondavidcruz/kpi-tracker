import { redirect } from "next/navigation";

// Editing moved onto the main Monday Meeting page (below the deck).
export default function MeetingEditRedirect() {
  redirect("/meeting#edit");
}
