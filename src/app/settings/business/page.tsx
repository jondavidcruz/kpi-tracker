import BusinessProfilePanel from "@/components/settings/BusinessProfilePanel";

export const dynamic = "force-dynamic";

// Legacy route — the real home is the Settings hub tab (/admin#business). Kept so old
// bookmarks still work; renders the same shared panel (Jon 2026-11-03 consolidation).
export default async function BusinessProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const sp = await searchParams;
  return <BusinessProfilePanel saved={!!sp.saved} />;
}
