// 🎭 /demo — public showcase of the War Room on 100% fake data. No auth, no DB reads.
// Reachable without a login (see PUBLIC_PATHS in src/lib/supabase/proxy.ts) so it can be
// shown to anyone. Everything comes from src/lib/demo-data.ts.
import type { Metadata } from "next";
import DemoApp from "@/components/DemoApp";

export const metadata: Metadata = { title: "War Room — Demo", robots: { index: false, follow: false } };
// Dynamic (not static): the root AppShell reads headers()/cookies + builds a Supabase client,
// which only exists at request time — a static prerender fails at build. The demo itself still
// reads no DB; it just renders at request time like every other route.
export const dynamic = "force-dynamic";

export default function DemoPage() {
  return <DemoApp />;
}
