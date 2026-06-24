import { redirect } from "next/navigation";

// Monthly Financials was consolidated into War Room Health (/leaks). Keep this route
// as a redirect so old links/bookmarks still land in the right place.
export default function MonthlyPage() {
  redirect("/leaks");
}
