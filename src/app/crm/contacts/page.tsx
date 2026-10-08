import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { parseTags, CRM_STAGES } from "@/lib/crm-shared";
import SelectAllBox from "@/components/SelectAllBox";
import { bulkContactsAction } from "../actions";
import DialPad from "@/components/DialPad";
import CallButton from "@/components/CallButton";
import { commsFor } from "@/lib/crm-comms";
import { readPipelines } from "@/lib/crm";

export const dynamic = "force-dynamic";

// 👤 Contacts — the GHL global contact list: every seller in one searchable,
// paginated table (name / phone / email / owner / tags / last activity).
const PAGE = 50;

export default async function CrmContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; p?: string; who?: string }> }) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return <Card className="p-10 text-center text-slate-400">Contacts live inside the Seller CRM (acquisitions + managers).</Card>;
  const manager = isManager(me!);
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const who = manager ? (sp.who ?? "") : me!.name;
  const page = Math.max(1, Number(sp.p) || 1);

  const where = {
    archivedAt: null,
    ...(who ? { assignedTo: { equals: who, mode: "insensitive" as const } } : {}),
    ...(q ? { OR: [
      { name: { contains: q, mode: "insensitive" as const } },
      { phone: { contains: q.replace(/\D/g, "") || q } },
      { altPhone: { contains: q.replace(/\D/g, "") || q } },
      { email: { contains: q, mode: "insensitive" as const } },
      { address: { contains: q, mode: "insensitive" as const } },
      { tags: { contains: q, mode: "insensitive" as const } },
    ] } : {}),
  };
  const [total, contacts] = await Promise.all([
    db.crmContact.count({ where }),
    db.crmContact.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE,
      include: { opportunities: { where: { archivedAt: null }, select: { id: true, stage: true, pipeline: true }, take: 1, orderBy: { updatedAt: "desc" } } } }),
  ]);
  const pipelines = manager ? await readPipelines() : [];
  const reps2 = manager ? await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const comms = await commsFor(me!);
  const reps = manager ? await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (np: number) => `/crm/contacts?p=${np}${q ? `&q=${encodeURIComponent(q)}` : ""}${who ? `&who=${encodeURIComponent(who)}` : ""}`;

  return (
    <div className="space-y-4">
      <SectionTitle title="👤 Contacts" subtitle={`${total.toLocaleString()} sellers — search by name, phone, email, property or tag.`} accent="bg-brand-gold"
        right={<span className="flex items-center gap-2">{comms.call && <DialPad />}<Link href="/crm" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">🗂 Pipeline</Link></span>} />

      <Card className="space-y-2 p-3">
        <form className="flex flex-wrap items-center gap-2" action="/crm/contacts" method="get">
          <input name="q" defaultValue={q} placeholder="🔎 Search contacts…" className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          {who && <input type="hidden" name="who" value={who} />}
          <button className="rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white">Search</button>
          {q && <Link href={`/crm/contacts${who ? `?who=${encodeURIComponent(who)}` : ""}`} className="text-xs font-bold text-slate-400 hover:text-slate-600">clear</Link>}
        </form>
        {manager && (
          <div className="flex flex-wrap gap-1.5">
            <Link prefetch={false} href={`/crm/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${!who ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600"}`}>Everyone</Link>
            {reps.map((r) => (
              <Link key={r.id} prefetch={false} href={`/crm/contacts?who=${encodeURIComponent(r.name)}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${who === r.name ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600"}`}>{r.name.split(" ")[0]}</Link>
            ))}
          </div>
        )}
      </Card>

      <form action={bulkContactsAction}>
      {manager && (
        <Card className="mb-3 flex flex-wrap items-center gap-2 p-3">
          <SelectAllBox />
          <span className="text-[11px] font-bold text-slate-500">Mass edit checked →</span>
          <select name="op" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold">
            <option value="addtag">🏷 Add tag</option>
            <option value="owner">👤 Set owner</option>
            <option value="stage">📊 Set stage</option>
            <option value="pipeline">🔀 Move pipeline</option>
          </select>
          <input name="value" placeholder="value (tag text / exact stage key)" className="min-w-[160px] rounded-lg border border-slate-200 px-2 py-1.5 text-xs" list="bulkhints" />
          <datalist id="bulkhints">
            {reps2.map((r) => <option key={r.id} value={r.name} />)}
            {pipelines.map((p) => <option key={p.name} value={p.name} />)}
            {CRM_STAGES.map((st) => <option key={st.key} value={st.key} />)}
          </datalist>
          <button className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white">Apply</button>
          <span className="text-[10px] text-slate-400">owner also reassigns their leads · tag adds to contact + leads</span>
        </Card>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {manager && <th className="w-8 px-3 py-2.5"></th>}
              <th className="px-4 py-2.5">Contact</th><th className="px-3 py-2.5">Phone</th><th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Owner</th><th className="px-3 py-2.5">Stage</th><th className="px-3 py-2.5">Tags</th><th className="px-3 py-2.5 text-right">Last activity</th><th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => {
              const opp = c.opportunities[0];
              return (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  {manager && <td className="px-3 py-2.5"><input type="checkbox" name="ids" value={c.id} /></td>}
                  <td className="px-4 py-2.5">
                    {opp ? <Link href={`/crm/${opp.id}`} className="font-bold text-slate-800 hover:text-indigo-600">{c.name}</Link> : <span className="font-bold text-slate-800">{c.name}</span>}
                    {c.address && <div className="max-w-[200px] truncate text-[11px] text-slate-400">{c.address}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{c.phone}</td>
                  <td className="max-w-[180px] truncate px-3 py-2.5 text-slate-600">{c.email}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12px] font-semibold text-slate-500">{c.assignedTo.split(" ")[0] || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[11px] font-bold text-slate-500">{opp?.stage ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {parseTags(c.tags).slice(0, 3).map((t) => <span key={t} className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600">#{t}</span>)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-[11px] text-slate-400">{c.updatedAt.toLocaleDateString([], { month: "short", day: "numeric" })}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="flex items-center gap-1">
                      {comms.call && c.phone && <CallButton phone={c.phone} name={c.name} oppId={opp?.id} contactId={c.id} label="📞" subtle />}
                      <Link prefetch={false} href={`/crm/conversations?c=${c.id}`} title="Open conversation" className="rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200">💬</Link>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {contacts.length === 0 && <div className="p-8 text-center text-sm text-slate-400">No contacts match.</div>}
      </Card>
      </form>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Page {page} of {pages}</span>
        <span className="flex gap-2">
          {page > 1 && <Link prefetch={false} href={qs(page - 1)} className="rounded-lg bg-slate-100 px-3 py-1.5 font-bold hover:bg-slate-200">← Prev</Link>}
          {page < pages && <Link prefetch={false} href={qs(page + 1)} className="rounded-lg bg-slate-100 px-3 py-1.5 font-bold hover:bg-slate-200">Next →</Link>}
        </span>
      </div>
    </div>
  );
}
