import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Retired (Jon 2026-10-20): buyers now live in ONE place — Buyer Research. Nightly
// sourcing drops to-vet buyers straight into it (tagged by source + market), so this
// separate page is gone. Kept as a redirect so old links/bookmarks still land right.
export default function CashBuyersPage() {
  redirect("/vetting");
}
