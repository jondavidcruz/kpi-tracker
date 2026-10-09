import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

// ✉️ Email Health (Jon 2026-10-09: "its own tab like Phone Health") — covers
// BOTH senders: Direct REI's campaign emails AND the War Room's own sends.
export default async function EmailHealthPage() {
  const me = await getCurrentUser();
  if (!isManager(me)) return <Card className="p-10 text-center text-slate-400">Managers only.</Card>;

  const monthAgo = new Date(Date.now() - 30 * 86400_000);
  const [sent, bounced, failedSends, opened, clicked, dreiRow] = await Promise.all([
    db.crmEvent.count({ where: { kind: "email", at: { gte: monthAgo }, body: { startsWith: "➡️" } } }),
    db.crmEvent.count({ where: { kind: "email", at: { gte: monthAgo }, body: { contains: "bounced" } } }),
    db.crmEvent.count({ where: { kind: "email", at: { gte: monthAgo }, body: { contains: "SEND FAILED" } } }),
    db.crmEvent.count({ where: { kind: "email", at: { gte: monthAgo }, body: { contains: "Opened our email" } } }),
    db.crmEvent.count({ where: { kind: "email", at: { gte: monthAgo }, body: { contains: "clicked" } } }),
    db.resource.findFirst({ where: { category: "__directrei_feed__" } }),
  ]);
  let drei: { seller?: { emailRepliesToday?: number; emailReplies7d?: number; new7d?: number }; buyer?: { emailRepliesToday?: number; emailReplies7d?: number } } | null = null;
  try { drei = dreiRow?.description ? JSON.parse(dreiRow.description) : null; } catch { /* none */ }
  const bounceRate = sent > 0 ? Math.round(((bounced + failedSends) / sent) * 100) : 0;
  const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
  const chip = (ok: boolean, warn: boolean) => ok ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : warn ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-red-50 text-red-700 ring-red-200";
  const bounceEvents = await db.crmEvent.findMany({
    where: { kind: "email", at: { gte: monthAgo }, OR: [{ body: { contains: "bounced" } }, { body: { contains: "SEND FAILED" } }] },
    orderBy: { at: "desc" }, take: 10,
    select: { body: true, at: true, contactId: true },
  });
  const bounceContacts = await db.crmContact.findMany({ where: { id: { in: [...new Set(bounceEvents.map((b) => b.contactId))] } }, select: { id: true, name: true, email: true } });
  const bcMap = new Map(bounceContacts.map((c) => [c.id, c]));
  const recentBounces = bounceEvents.map((b) => ({ ...b, contact: bcMap.get(b.contactId) ?? null }));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionTitle title="✉️ Email Health" subtitle="Both engines in one place: Direct REI's campaign emails and the War Room's own sends. Over 2% bounce = clean the list or warm the domain." accent="bg-sky-400" />

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-5">
          <div className="text-sm font-extrabold text-slate-800">📨 Direct REI campaigns</div>
          <p className="mt-0.5 text-[11px] text-slate-400">The AI outreach engine — replies are the health signal their API exposes (bounce rates live inside Direct REI&apos;s own dashboard; their API doesn&apos;t share them yet).</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100"><div className="text-2xl font-extrabold text-slate-800">{drei?.seller?.emailReplies7d ?? 0}</div><div className="text-[10px] font-bold uppercase text-slate-400">Seller email replies · 7d</div></div>
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100"><div className="text-2xl font-extrabold text-slate-800">{drei?.buyer?.emailReplies7d ?? 0}</div><div className="text-[10px] font-bold uppercase text-slate-400">Buyer email replies · 7d</div></div>
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100"><div className="text-2xl font-extrabold text-slate-800">{drei?.seller?.emailRepliesToday ?? 0}</div><div className="text-[10px] font-bold uppercase text-slate-400">Seller replies today</div></div>
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100"><div className="text-2xl font-extrabold text-slate-800">{drei?.seller?.new7d ?? 0}</div><div className="text-[10px] font-bold uppercase text-slate-400">New seller leads · 7d</div></div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-sm font-extrabold text-slate-800">🏰 War Room sends <span className="font-normal text-slate-400">(Resend — welcome emails, rep emails, offers)</span></div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${chip(bounceRate <= 2, bounceRate <= 5)}`}>{bounceRate}% bounce ({bounced + failedSends} of {sent})</span>
            <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">{sent} sent · 30d</span>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100">👀 {opened} opens{openRate ? ` (${openRate}%)` : ""}</span>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100">🖱 {clicked} clicks</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Opens/clicks + bounces land on each lead&apos;s timeline automatically (Resend webhooks).</p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-2 text-sm font-extrabold text-slate-800">⚠️ Recent bounces &amp; failures (30d)</div>
        {recentBounces.length === 0 ? <p className="text-xs text-slate-400">None — clean month. 🎉</p> : (
          <div className="space-y-1.5">
            {recentBounces.map((b, i) => (
              <div key={i} className="rounded-lg bg-red-50/50 px-3 py-1.5 text-xs ring-1 ring-red-100">
                <b className="text-slate-800">{b.contact?.name}</b> <span className="text-slate-500">{b.contact?.email}</span>
                <span className="float-right text-[10px] text-slate-400">{b.at.toLocaleDateString("en-US")}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-400">Bounced addresses: fix the typo or switch that lead to phone-only — repeated sends to dead addresses hurt the whole domain&apos;s reputation.</p>
      </Card>
    </div>
  );
}
