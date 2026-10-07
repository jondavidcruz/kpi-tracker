import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { deleteCrmApptAction } from "../actions";

export const dynamic = "force-dynamic";

// 📅 Calendar — the GHL appointment list: every booked appointment across the
// team, upcoming first (book them from any lead card or the quick-view panel).
export default async function CrmCalendarPage({ searchParams }: { searchParams: Promise<{ v?: string; who?: string }> }) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return <Card className="p-10 text-center text-slate-400">The calendar lives inside the Seller CRM (acquisitions + managers).</Card>;
  const manager = isManager(me!);
  const sp = await searchParams;
  const v = sp.v === "past" ? "past" : "upcoming";
  const who = manager ? (sp.who ?? "") : me!.name;
  const now = new Date();

  const appts = await db.crmAppointment.findMany({
    where: {
      ...(v === "past" ? { at: { lt: now } } : { at: { gte: new Date(now.getTime() - 3600_000) } }),
      ...(who ? { withWho: { contains: who.split(" ")[0], mode: "insensitive" as const } } : {}),
    },
    orderBy: { at: v === "past" ? "desc" : "asc" }, take: 100,
  });
  const contactIds = [...new Set(appts.map((a) => a.contactId).filter(Boolean))];
  const contacts = await db.crmContact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true, phone: true } });
  const cmap = new Map(contacts.map((c) => [c.id, c]));
  const reps = manager ? await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];

  // group by day for an Apple-clean agenda
  const byDay = new Map<string, typeof appts>();
  for (const a of appts) {
    const k = a.at.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(a);
  }

  return (
    <div className="space-y-4">
      <SectionTitle title="📅 Calendar" subtitle="Every seller appointment, team-wide — book them from any lead card." accent="bg-brand-gold"
        right={<Link href="/crm" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">🗂 Pipeline</Link>} />

      <div className="flex flex-wrap items-center gap-2">
        {[["upcoming", "Upcoming"], ["past", "Past"]].map(([k, l]) => (
          <Link key={k} prefetch={false} href={`/crm/calendar?v=${k}${who ? `&who=${encodeURIComponent(who)}` : ""}`} className={`rounded-full px-3 py-1.5 text-xs font-bold ${v === k ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{l}</Link>
        ))}
        {manager && (
          <span className="ml-2 flex flex-wrap gap-1.5">
            <Link prefetch={false} href={`/crm/calendar?v=${v}`} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${!who ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600"}`}>Everyone</Link>
            {reps.map((r) => (
              <Link key={r.id} prefetch={false} href={`/crm/calendar?v=${v}&who=${encodeURIComponent(r.name)}`} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${who === r.name ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600"}`}>{r.name.split(" ")[0]}</Link>
            ))}
          </span>
        )}
      </div>

      {appts.length === 0 && <Card className="p-8 text-center text-sm text-slate-400">No {v} appointments{who ? ` for ${who.split(" ")[0]}` : ""} — book one from a lead card (📅 Appointments section).</Card>}

      {[...byDay.entries()].map(([day, list]) => (
        <div key={day} className="space-y-2">
          <div className="pl-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{day}</div>
          <Card className="divide-y divide-slate-50 p-0">
            {list.map((a) => {
              const c = cmap.get(a.contactId);
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-20 shrink-0 text-center">
                    <div className="text-sm font-extrabold text-slate-800">{a.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                  </div>
                  <div className="h-8 w-1 shrink-0 rounded-full bg-brand-gold" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-slate-800">{a.title}</div>
                    <div className="truncate text-[11px] text-slate-500">
                      {c ? (a.oppId ? <Link href={`/crm/${a.oppId}`} className="text-indigo-500 hover:underline">👤 {c.name}</Link> : `👤 ${c.name}`) : null}
                      {c?.phone ? ` · ${c.phone}` : ""}{a.note ? ` · ${a.note}` : ""}
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{a.withWho.split(" ")[0] || "—"}</span>
                  <form action={deleteCrmApptAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button title="Cancel appointment" className="text-sm text-slate-300 hover:text-red-500">🗑</button>
                  </form>
                </div>
              );
            })}
          </Card>
        </div>
      ))}
    </div>
  );
}
