import Link from "next/link";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { getMeetingDeck } from "@/lib/meeting";
import { todayStr } from "@/lib/date";
import { Card, SectionTitle } from "@/components/ui";
import MeetingDeckView from "@/components/MeetingDeck";

export const dynamic = "force-dynamic";

export default async function MeetingPage() {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const settings = await getSettings();
  const deck = await getMeetingDeck(todayStr(settings.orgTimezone));

  return (
    <div className="space-y-5">
      <SectionTitle
        title="🗓 Monday Meeting"
        subtitle="One-click all-call deck — live from your KPIs. Hit Present for full screen."
        accent="bg-brand-gold"
        right={<Link href="/admin#meeting" className="text-sm font-semibold text-brand-navy hover:underline">Edit deck content →</Link>}
      />
      <MeetingDeckView deck={deck} />
    </div>
  );
}
